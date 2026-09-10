"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ModalShell } from "@/components/ui/modal-shell";
import { useMoney } from "@/components/ui/currency-select";
import { useBet } from "@/features/prediction/hooks/use-bet";
import { usePredictionConsent } from "@/features/prediction/hooks/use-prediction-consent";
import { predictionPayout } from "@/lib/format";
import { toast } from "@/lib/toast";
import { track } from "@/lib/analytics/mixpanel";
import type { Prediction } from "@/lib/types";
import { isValidPredictionStake, PREDICTION_MIN_STAKE_USD } from "@/features/prediction/lib/stake";

const AMOUNTS = [5, 10, 25, 50];

interface BetModalProps {
  prediction: Prediction | null;
  side: "yes" | "no";
  onClose: () => void;
  onPlaced?: () => void;
  decimalOdds?: number;
}

interface PredictionBetFormProps extends BetModalProps {
  compact?: boolean;
  onBusyChange?: (busy: boolean) => void;
}

// The full bet flow: a one-time risk consent, then a bet form that places a real
// market order. Onboarding (Deposit Wallet + approvals) runs transparently on
// the first bet and is surfaced as the button label.
export function PredictionBetForm({
  prediction,
  side,
  onClose,
  onPlaced,
  decimalOdds,
  compact = false,
  onBusyChange,
}: PredictionBetFormProps) {
  const t = useTranslations("prediction");
  const money = useMoney();
  const { accepted, accept } = usePredictionConsent();
  const {
    placeBet,
    phase,
    error,
    sessionStatus,
    predictionBalanceUsd,
    usdcTotal,
    portfolioLoading,
  } = useBet();
  const [amount, setAmount] = useState(String(PREDICTION_MIN_STAKE_USD));

  const amountUsd = Number(amount);
  const validAmount = isValidPredictionStake(amountUsd);
  const belowMinimum = Number.isFinite(amountUsd) && amountUsd > 0 && !validAmount;
  const tokenId = prediction
    ? side === "yes"
      ? prediction.yesTokenId
      : prediction.noTokenId
    : undefined;
  const priceCents = prediction ? (side === "yes" ? prediction.yes : prediction.no) : "0¢";
  const displayedPrice = decimalOdds?.toFixed(2) ?? priceCents;
  const tradable = Boolean(tokenId);

  const busy = phase !== "idle";

  useEffect(() => {
    onBusyChange?.(busy);
  }, [busy, onBusyChange]);

  // One button drives the whole flow, so its label tracks the current step:
  // account setup, then moving funds from Base USDC, then placing.
  const actionLabel = !validAmount
    ? t("minimumBet", { amount: money.formatExact(PREDICTION_MIN_STAKE_USD) })
    : sessionStatus === "deploying"
      ? t("settingUpAccount")
      : sessionStatus === "approving"
        ? t("enablingTrading")
        : sessionStatus === "connecting"
          ? t("connecting")
          : phase === "funding"
            ? t("addingFunds")
            : phase === "settling"
              ? t("waitingForFunds")
              : phase === "approving"
                ? t("enablingTrading")
                : phase === "placing"
                  ? t("placingBet")
                  : side === "yes"
                    ? t("placeBetYes", { amount: money.formatExact(amountUsd) })
                    : t("placeBetNo", { amount: money.formatExact(amountUsd) });

  // One click: place, and if the account is short, move the stake from Base
  // USDC and retry until it lands.
  const submit = async () => {
    if (!tokenId || !validAmount) return;
    const toastId = toast.loading(t("placingBet"));
    try {
      await placeBet({ tokenId, amountUsd });
      track("prediction_bet_placed", {
        // This modal trades the curated Polymarket set; the user-created
        // markets have their own flow and report scope "local".
        market_id: prediction?.conditionId ?? tokenId,
        category: prediction?.tag,
        scope: "global",
        side,
        amount_usd: amountUsd,
        // The label reads like "62¢"; the catalog wants the number.
        price_cents: Number(priceCents.replace(/[^0-9.]/gu, "")),
      });
      toast.success(
        side === "yes"
          ? t("betPlacedYes", { amount: money.formatExact(amountUsd) })
          : t("betPlacedNo", { amount: money.formatExact(amountUsd) }),
        { id: toastId }
      );
      onPlaced?.();
      onClose();
    } catch {
      // Error is surfaced inline below; keep the modal open to retry.
      toast.error(t("betFailed"), { id: toastId });
    }
  };

  return (
    <div className={compact ? "p-3" : "p-5 sm:p-6"} data-sensitive="other" data-broadcast-suspend>
      {!accepted ? (
        <div className="flex flex-col gap-3">
          <div className="ws-display text-[22px]">{t("beforeYouTrade")}</div>
          <p className="text-[13.5px] leading-[1.55] font-normal text-white/70">
            {t("consentBody")}
          </p>
          <ul className="flex flex-col gap-1.5 text-[12.5px] font-normal text-white/55">
            <li>• {t("consentPointStake")}</li>
            <li>• {t("consentPointRegion")}</li>
            <li>• {t("consentPointFinal")}</li>
          </ul>
          <button
            onClick={accept}
            className="text-ink mt-1 w-full cursor-pointer rounded-[14px] bg-white p-3.5 font-sans text-[15px] font-semibold hover:opacity-90"
          >
            {t("acceptRisks")}
          </button>
          <button
            onClick={onClose}
            className="w-full cursor-pointer rounded-[14px] p-2.5 font-sans text-[13px] font-medium text-white/60 hover:text-white"
          >
            {t("notNow")}
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3.5">
          <div>
            <div className="text-[11px] font-normal tracking-[0.04em] text-white/45 uppercase">
              {prediction?.tag}
            </div>
            <div className="ws-display mt-1 text-[19px] leading-tight">{prediction?.q}</div>
          </div>

          <div className="ws-inset flex items-center justify-between p-3.5">
            <span className="text-[13px] font-normal text-white/60">{t("youAreBuying")}</span>
            <span
              className="font-sans text-sm font-semibold"
              style={{ color: side === "yes" ? "#7CE7B0" : "#F6A5A5" }}
            >
              {side === "yes" ? t("yesLabel") : t("noLabel")} · {displayedPrice}
            </span>
          </div>

          {!tradable ? (
            <div className="border-down/25 bg-down/10 rounded-[14px] border px-4 py-3 text-[12.5px] font-normal text-white/70">
              {t("notTradable")}
            </div>
          ) : (
            <>
              <div className="flex h-11 items-center rounded-xl border border-white/12 bg-black/15 px-3 focus-within:border-white/25">
                <span className="grid size-5 place-items-center rounded-full bg-[#3f8b8e] text-[9px] font-bold text-white">
                  $
                </span>
                <input
                  aria-label="Stake in USDC"
                  inputMode="decimal"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  className="min-w-0 flex-1 bg-transparent px-2 text-[13px] text-white outline-none"
                />
                <span className="text-[10px] font-semibold text-white/50">USDC</span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[10px]">
                <div className="rounded-xl border border-white/8 bg-white/3 px-3 py-2.5">
                  <div className="text-white/40">Available to bet</div>
                  <div className="tnum mt-0.5 font-semibold text-white/80">
                    {predictionBalanceUsd === null
                      ? "Checked on placement"
                      : `${predictionBalanceUsd.toFixed(2)} pUSD`}
                  </div>
                </div>
                <div className="rounded-xl border border-white/8 bg-white/3 px-3 py-2.5">
                  <div className="text-white/40">Base wallet</div>
                  <div className="tnum mt-0.5 font-semibold text-white/80">
                    {portfolioLoading ? "Checking..." : `${usdcTotal.toFixed(2)} USDC`}
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                {AMOUNTS.map((a) => (
                  <button
                    key={a}
                    onClick={() => setAmount(String(a))}
                    className={`flex-1 cursor-pointer rounded-xl border py-2.5 font-sans text-sm font-medium transition-colors ${
                      amountUsd === a
                        ? "border-accent/45 bg-accent/12 text-white"
                        : "border-white/10 bg-white/4 text-white/70 hover:bg-white/8"
                    }`}
                  >
                    {money.formatExact(a)}
                  </button>
                ))}
              </div>

              {belowMinimum || !Number.isFinite(amountUsd) || amountUsd <= 0 ? (
                <p className="text-[11px] font-medium text-[#efb72a]">
                  {t("minimumBet", { amount: money.formatExact(PREDICTION_MIN_STAKE_USD) })}
                </p>
              ) : null}

              <div className="ws-inset flex items-center justify-between p-3.5 text-[13px] font-normal">
                <span className="text-white/55">{t("payoutIfRight")}</span>
                <span className="tnum text-accent font-medium">
                  {validAmount
                    ? money.formatExact(Number(predictionPayout(amountUsd, priceCents)))
                    : "-"}
                </span>
              </div>

              {error ? <p className="text-down text-[13px] font-normal">{error}</p> : null}

              <button
                onClick={submit}
                disabled={busy || !validAmount}
                className="text-ink mt-1 w-full cursor-pointer rounded-[14px] bg-white p-3.5 font-sans text-[15px] font-semibold hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {actionLabel}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function BetModal(props: BetModalProps) {
  const [busy, setBusy] = useState(false);
  return (
    <ModalShell open={props.prediction !== null} onClose={busy ? () => {} : props.onClose}>
      <PredictionBetForm {...props} onBusyChange={setBusy} />
    </ModalShell>
  );
}
