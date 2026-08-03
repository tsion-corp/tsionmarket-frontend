"use client";

import { BRAND } from "@/lib/brand";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Eyebrow } from "@/components/ui/eyebrow";
import { ModalShell } from "@/components/ui/modal-shell";
import { useMoney } from "@/components/ui/currency-select";
import { PredictionCard } from "@/components/dashboard/prediction/prediction-card";
import { PredictionSlider } from "@/components/dashboard/prediction/prediction-slider";
import { BetModal } from "@/components/dashboard/prediction/bet-modal";
import { BetSlipSheet } from "@/components/dashboard/prediction/bet-slip-sheet";
import { PositionsPanel } from "@/components/dashboard/prediction/positions-panel";
import { LocalPredictionView } from "@/components/dashboard/views/local-prediction-view";
import { usePredictions } from "@/hooks/use-predictions";
import { usePolymarketAccess } from "@/hooks/use-polymarket-access";
import { usePolymarketPositions, type PolymarketPosition } from "@/hooks/use-polymarket-positions";
import { usePolymarketCashout } from "@/hooks/use-polymarket-cashout";
import { usePolymarketRedeem } from "@/hooks/use-polymarket-redeem";
import { useSettleToBase } from "@/hooks/use-settle";
import { PREDICTIONS } from "@/lib/data/dashboard";
import { toast } from "@/lib/toast";
import type { RawPosition } from "@/lib/prediction";
import type { Prediction } from "@/lib/types";

export function PredictionView() {
  const t = useTranslations("prediction");
  const money = useMoney();
  const [desktop, setDesktop] = useState(false);
  // Which prediction system is shown: the live Polymarket markets or our own
  // on-chain CPMM markets ("Local"). Both coexist; the user picks.
  const [source, setSource] = useState<"polymarket" | "local">("polymarket");
  const [bet, setBet] = useState<{ p: Prediction; side: "yes" | "no" } | null>(null);
  const [slip, setSlip] = useState<PolymarketPosition | null>(null);
  const access = usePolymarketAccess();
  const positions = usePolymarketPositions();
  const redeem = usePolymarketRedeem();
  const cashout = usePolymarketCashout();
  const settle = useSettleToBase();
  const { data: live } = usePredictions();

  const onRedeem = async (conditionId: string) => {
    const toastId = toast.loading(t("toastClaiming"));
    // 1) Claim: convert the winning shares to pUSD in the prediction account.
    try {
      await redeem.redeem(conditionId);
    } catch {
      toast.error(redeem.error ?? t("toastClaimFailed"), { id: toastId });
      return;
    }
    // 2) Move the winnings out to USDC on Base. If this leg fails, the claim
    // still succeeded and the funds are safe as pUSD, recoverable via Cash out.
    try {
      await settle.settleToBase();
      toast.success(t("toastClaimSuccess"), { id: toastId });
    } catch {
      toast.error(t("toastClaimSettleFailed"), {
        id: toastId,
      });
    }
    setSlip(null);
    positions.refresh();
  };

  // Sells an open position back into the market before resolution. Proceeds
  // land as pUSD in the prediction balance, where the existing cash-out flow
  // can move them to Base.
  const onSellPosition = async (position: RawPosition) => {
    const tokenId = position.tokenId ?? null;
    const shares = Number(position.size ?? 0);
    if (!tokenId || !(shares > 0)) return;
    const toastId = toast.loading(t("toastSellingPosition"));
    try {
      const { proceedsUsd } = await cashout.cashOut({ tokenId, shares });
      toast.success(t("toastSoldPosition", { amount: money.format(proceedsUsd) }), {
        id: toastId,
      });
      setSlip(null);
      positions.refresh();
    } catch {
      toast.error(cashout.error ?? t("toastSellFailed"), { id: toastId });
    }
  };

  const onCashOut = async () => {
    if (positions.cashable == null || positions.cashable <= 0) return;
    const toastId = toast.loading(t("toastCashingOut"));
    try {
      await settle.settleToBase();
      toast.success(t("toastCashOutSuccess"), { id: toastId });
      positions.refresh();
    } catch {
      toast.error(settle.error ?? t("toastCashOutFailed"), { id: toastId });
    }
  };

  // Live Polymarket markets, with the static set as a fallback so the section
  // never blanks if the feed is briefly unavailable.
  const predictions = live && live.length > 0 ? live : PREDICTIONS;

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const update = () => setDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const openBet = (p: Prediction, yes: boolean) => setBet({ p, side: yes ? "yes" : "no" });

  return (
    <div className="mx-auto w-full max-w-[1520px] p-4 sm:p-6 lg:p-8">
      <Eyebrow>{t("eyebrow")}</Eyebrow>
      <h2 className="ws-display mt-2.5 text-[30px] tracking-[-0.02em]">{t("heading")}</h2>

      {/* Source switch: live Polymarket markets vs our on-chain CPMM markets. */}
      <div className="mt-4 inline-flex gap-1 rounded-xl bg-white/5 p-1">
        {(["polymarket", "local"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setSource(s)}
            className={`cursor-pointer rounded-lg px-4 py-1.5 text-[13px] font-semibold transition-colors ${
              source === s ? "bg-white/12 text-white" : "text-white/50 hover:text-white/75"
            }`}
          >
            {t(`sourceTab_${s}`)}
          </button>
        ))}
      </div>

      {source === "local" ? (
        <div className="mt-[18px]">
          <LocalPredictionView />
        </div>
      ) : !access.allowed ? (
        <div className="ws-card mt-[18px] flex flex-col items-center gap-2 px-6 py-12 text-center">
          <div className="ws-display text-[22px]">{t("regionBlockedTitle")}</div>
          <p className="max-w-[360px] text-[13.5px] font-normal text-white/55">
            {t("regionBlockedBody", { brand: BRAND })}
          </p>
        </div>
      ) : (
        <div className="mt-[18px]">
          {desktop ? (
            // Non-mobile: up to 8 markets in a grid whose column count follows
            // the CONTENT width, not the viewport — with the sidebar open an
            // iPad's 768-1024px viewport leaves ~520-780px of content, where a
            // fixed four-up crushed every card. Two columns is the floor;
            // three and four step in as the container genuinely fits them.
            <div className="@container">
              <div className="grid grid-cols-2 gap-4 @min-[900px]:grid-cols-3 @min-[900px]:gap-6 @min-[1240px]:grid-cols-4 @min-[1240px]:gap-7">
                {predictions.slice(0, 8).map((p) => (
                  <PredictionCard key={p.q} prediction={p} onBuy={(yes) => openBet(p, yes)} />
                ))}
              </div>
            </div>
          ) : (
            <PredictionSlider predictions={predictions} onBuy={openBet} />
          )}

          <PositionsPanel
            positions={positions.positions}
            available={positions.available}
            cashable={positions.cashable}
            loading={positions.loading}
            loaded={positions.loaded}
            error={positions.error}
            onRefresh={positions.refresh}
            onOpenSlip={setSlip}
            onRedeem={onRedeem}
            redeemingId={redeem.redeeming}
            onCashOut={onCashOut}
            cashingOut={settle.phase !== "idle"}
          />
        </div>
      )}

      <BetModal
        prediction={bet?.p ?? null}
        side={bet?.side ?? "yes"}
        onClose={() => setBet(null)}
        onPlaced={positions.refresh}
      />

      <ModalShell open={slip !== null} onClose={() => setSlip(null)}>
        {slip ? (
          <BetSlipSheet
            position={slip}
            onClaim={onRedeem}
            claiming={redeem.redeeming != null || settle.phase !== "idle"}
            onSell={onSellPosition}
            selling={cashout.phase !== "idle"}
          />
        ) : null}
      </ModalShell>
    </div>
  );
}
