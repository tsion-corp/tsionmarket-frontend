"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ModalShell } from "@/components/ui/modal-shell";
import { useBet } from "@/hooks/use-bet";
import { usePredictionConsent } from "@/hooks/use-prediction-consent";
import { predictionPayout } from "@/lib/format";
import { toast } from "@/lib/toast";
import type { Prediction } from "@/lib/types";

const AMOUNTS = [5, 10, 25, 50];

interface BetModalProps {
  prediction: Prediction | null;
  side: "yes" | "no";
  onClose: () => void;
  onPlaced?: () => void;
}

// The full bet flow: a one-time risk consent, then a bet form that places a real
// market order. Onboarding (Deposit Wallet + approvals) runs transparently on
// the first bet and is surfaced as the button label.
export function BetModal({ prediction, side, onClose, onPlaced }: BetModalProps) {
  const t = useTranslations("prediction");
  const { accepted, accept } = usePredictionConsent();
  const { placeBet, phase, error, sessionStatus, usdcTotal, portfolioLoading } = useBet();
  const [amount, setAmount] = useState(10);

  const open = prediction !== null;
  const tokenId = prediction
    ? side === "yes"
      ? prediction.yesTokenId
      : prediction.noTokenId
    : undefined;
  const priceCents = prediction ? (side === "yes" ? prediction.yes : prediction.no) : "0¢";
  const tradable = Boolean(tokenId);

  const busy = phase !== "idle";

  // One button drives the whole flow, so its label tracks the current step:
  // account setup, then moving funds from Base USDC, then placing.
  const actionLabel =
    sessionStatus === "deploying"
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
                    ? t("placeBetYes", { amount: `$${amount}` })
                    : t("placeBetNo", { amount: `$${amount}` });

  // One click: place, and if the account is short, move the stake from Base
  // USDC and retry until it lands.
  const submit = async () => {
    if (!tokenId) return;
    const toastId = toast.loading(t("placingBet"));
    try {
      await placeBet({ tokenId, amountUsd: amount });
      toast.success(
        side === "yes"
          ? t("betPlacedYes", { amount: `$${amount}` })
          : t("betPlacedNo", { amount: `$${amount}` }),
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
    <ModalShell open={open} onClose={busy ? () => {} : onClose}>
      <div className="p-5 sm:p-6">
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
                {side === "yes" ? t("yesLabel") : t("noLabel")} · {priceCents}
              </span>
            </div>

            {!tradable ? (
              <div className="border-down/25 bg-down/10 rounded-[14px] border px-4 py-3 text-[12.5px] font-normal text-white/70">
                {t("notTradable")}
              </div>
            ) : (
              <>
                <div className="flex gap-2">
                  {AMOUNTS.map((a) => (
                    <button
                      key={a}
                      onClick={() => setAmount(a)}
                      className={`flex-1 cursor-pointer rounded-xl border py-2.5 font-sans text-sm font-medium transition-colors ${
                        amount === a
                          ? "border-accent/45 bg-accent/12 text-white"
                          : "border-white/10 bg-white/4 text-white/70 hover:bg-white/8"
                      }`}
                    >
                      ${a}
                    </button>
                  ))}
                </div>

                <div className="ws-inset flex items-center justify-between p-3.5 text-[13px] font-normal">
                  <span className="text-white/55">{t("payoutIfRight")}</span>
                  <span className="tnum text-accent font-medium">
                    ${predictionPayout(amount, priceCents)}
                  </span>
                </div>

                {error ? <p className="text-down text-[13px] font-normal">{error}</p> : null}

                <button
                  onClick={submit}
                  disabled={busy}
                  className="text-ink mt-1 w-full cursor-pointer rounded-[14px] bg-white p-3.5 font-sans text-[15px] font-semibold hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {actionLabel}
                </button>

                <p className="text-center text-xs font-normal text-white/45">
                  {!portfolioLoading
                    ? `${t("usdcOnBase", { amount: `$${usdcTotal.toFixed(2)}` })} `
                    : ""}
                  {t("betFundingNote")}
                </p>
              </>
            )}
          </div>
        )}
      </div>
    </ModalShell>
  );
}
