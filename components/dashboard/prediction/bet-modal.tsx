"use client";

import { useState } from "react";
import { ModalShell } from "@/components/ui/modal-shell";
import { usePlaceBet } from "@/hooks/use-place-bet";
import { usePolymarketFunding } from "@/hooks/use-polymarket-funding";
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
  const { place, placing, error, status } = usePlaceBet();
  const { fund, funding, error: fundError, usdcTotal, portfolioLoading } = usePolymarketFunding();
  const [amount, setAmount] = useState(10);

  // Placing fails with a balance/allowance error when the account has no pUSD;
  // offer to top up from the user's existing USDC.
  const needsFunds = error != null && /balance|allowance|insufficient|funds/i.test(error);

  // Guard the top-up: once balances have loaded, block it when the user can't
  // cover the amount rather than letting it fail deep in the transfer.
  const insufficientUsdc = !portfolioLoading && usdcTotal < amount;

  const addFunds = async () => {
    if (insufficientUsdc) {
      toast.error(
        `You have $${usdcTotal.toFixed(2)} USDC, which isn't enough for a $${amount} bet. Add USDC to your wallet first.`
      );
      return;
    }
    try {
      await fund(amount);
      toast.success(`Adding $${amount}. It lands in about a minute — then place your bet.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add funds. Try again.");
    }
  };

  const open = prediction !== null;
  const tokenId = prediction
    ? side === "yes"
      ? prediction.yesTokenId
      : prediction.noTokenId
    : undefined;
  const priceCents = prediction ? (side === "yes" ? prediction.yes : prediction.no) : "0¢";
  const tradable = Boolean(tokenId);

  const statusLabel =
    status === "deploying"
      ? "Setting up your account…"
      : status === "approving"
        ? "Enabling trading…"
        : status === "connecting"
          ? "Connecting…"
          : "Placing your bet…";

  const submit = async () => {
    if (!tokenId) return;
    try {
      await place({ tokenId, amountUsd: amount });
      toast.success(`Bet placed: $${amount} on ${side === "yes" ? "Yes" : "No"}`);
      onPlaced?.();
      onClose();
    } catch {
      // Error is surfaced inline below; keep the modal open to retry.
    }
  };

  return (
    <ModalShell open={open} onClose={placing ? () => {} : onClose}>
      <div className="p-5 sm:p-6">
        {!accepted ? (
          <div className="flex flex-col gap-3">
            <div className="ws-serif text-[22px]">Before you trade</div>
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
              <div className="ws-serif mt-1 text-[19px] leading-tight">{prediction?.q}</div>
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

                {error ? (
                  <p className="text-down text-[13px] font-normal">
                    {needsFunds ? "You need pUSD in your account to place this bet." : error}
                  </p>
                ) : null}

                <button
                  onClick={submit}
                  disabled={placing || funding}
                  className="text-ink mt-1 w-full cursor-pointer rounded-[14px] bg-white p-3.5 font-sans text-[15px] font-semibold hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {placing ? statusLabel : `Place $${amount} on ${side === "yes" ? "Yes" : "No"}`}
                </button>

                <button
                  onClick={addFunds}
                  disabled={funding || placing || insufficientUsdc}
                  className={`w-full cursor-pointer rounded-[14px] border p-3 font-sans text-[14px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                    needsFunds && !insufficientUsdc
                      ? "border-accent/45 bg-accent/12 text-white"
                      : "border-white/12 bg-white/5 text-white/80 hover:bg-white/10"
                  }`}
                >
                  {funding
                    ? "Adding funds…"
                    : insufficientUsdc
                      ? `Not enough USDC · you have $${usdcTotal.toFixed(2)}`
                      : `Add $${amount} from your USDC`}
                </button>

                {fundError ? (
                  <p className="text-down text-[13px] font-normal">{fundError}</p>
                ) : null}

                <p className="text-center text-xs font-normal text-white/45">
                  {!portfolioLoading ? `USDC available: $${usdcTotal.toFixed(2)}. ` : ""}Bets settle
                  in pUSD. Funding converts your Polygon USDC automatically. No network fee to
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
