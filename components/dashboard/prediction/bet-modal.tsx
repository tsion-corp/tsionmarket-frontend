"use client";

import { useState } from "react";
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
      ? "Setting up your account…"
      : sessionStatus === "approving"
        ? "Enabling trading…"
        : sessionStatus === "connecting"
          ? "Connecting…"
          : phase === "funding"
            ? "Adding funds from USDC…"
            : phase === "settling"
              ? "Waiting for funds to arrive…"
              : phase === "approving"
                ? "Enabling trading…"
                : phase === "placing"
                  ? "Placing your bet…"
                  : `Place $${amount} on ${side === "yes" ? "Yes" : "No"}`;

  // One click: place, and if the account is short, move the stake from Base
  // USDC and retry until it lands.
  const submit = async () => {
    if (!tokenId) return;
    const toastId = toast.loading("Placing your bet…");
    try {
      await placeBet({ tokenId, amountUsd: amount });
      toast.success(`Bet placed: $${amount} on ${side === "yes" ? "Yes" : "No"}`, { id: toastId });
      onPlaced?.();
      onClose();
    } catch {
      // Error is surfaced inline below; keep the modal open to retry.
      toast.error("Couldn't place your bet. Try again.", { id: toastId });
    }
  };

  return (
    <ModalShell open={open} onClose={busy ? () => {} : onClose}>
      <div className="p-5 sm:p-6">
        {!accepted ? (
          <div className="flex flex-col gap-3">
            <div className="ws-display text-[22px]">Before you trade</div>
            <p className="text-[13.5px] leading-[1.55] font-normal text-white/70">
              Prediction markets involve real money and real risk. Prices move, outcomes can go
              against you, and you can lose the full amount you stake. This is speculative trading,
              not investing, and it may be treated as gambling where you live.
            </p>
            <ul className="flex flex-col gap-1.5 text-[12.5px] font-normal text-white/55">
              <li>• Only stake what you can afford to lose.</li>
              <li>• Markets settle on Polymarket; availability depends on your region.</li>
              <li>• Funds move on-chain and trades are final once matched.</li>
            </ul>
            <button
              onClick={accept}
              className="text-ink mt-1 w-full cursor-pointer rounded-[14px] bg-white p-3.5 font-sans text-[15px] font-semibold hover:opacity-90"
            >
              I understand the risks
            </button>
            <button
              onClick={onClose}
              className="w-full cursor-pointer rounded-[14px] p-2.5 font-sans text-[13px] font-medium text-white/60 hover:text-white"
            >
              Not now
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
              <span className="text-[13px] font-normal text-white/60">You&apos;re buying</span>
              <span
                className="font-sans text-sm font-semibold"
                style={{ color: side === "yes" ? "#7CE7B0" : "#F6A5A5" }}
              >
                {side === "yes" ? "Yes" : "No"} · {priceCents}
              </span>
            </div>

            {!tradable ? (
              <div className="border-down/25 bg-down/10 rounded-[14px] border px-4 py-3 text-[12.5px] font-normal text-white/70">
                This market isn&apos;t tradable yet. Live Polymarket markets can be traded here
                soon.
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
                  <span className="text-white/55">Payout if right</span>
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
                  {!portfolioLoading ? `USDC on Base: $${usdcTotal.toFixed(2)}. ` : ""}Placing a bet
                  moves what it needs from your Base USDC and settles in pUSD. No network fee to
                  trade.
                </p>
              </>
            )}
          </div>
        )}
      </div>
    </ModalShell>
  );
}
