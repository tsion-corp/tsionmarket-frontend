"use client";

import { useState } from "react";
import { ModalShell } from "@/components/ui/modal-shell";
import { ButtonSpinner } from "@/components/ui/button-spinner";
import { formatAmount } from "@/lib/trade/math";
import { friendlyError } from "@/lib/errors";
import type { HlPositionView } from "@/features/trade/lib/hyperliquid-types";

interface HyperliquidClosePositionModalProps {
  position: HlPositionView | null;
  onClose: () => void;
  onConfirm: (position: HlPositionView) => Promise<void>;
}

// A manual close is real and hard to undo (unlike cancelling a resting
// order), so it sits behind a confirm step showing exactly what closes and
// at roughly what PnL — same ModalShell/status-text pattern as
// hyperliquid-fund-modal.tsx, not a bespoke one-off.
export function HyperliquidClosePositionModal({
  position,
  onClose,
  onConfirm,
}: HyperliquidClosePositionModalProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    if (!position) return;
    setBusy(true);
    setError(null);
    try {
      await onConfirm(position);
      onClose();
    } catch (err) {
      setError(friendlyError(err, "Failed to close position."));
    } finally {
      setBusy(false);
    }
  };

  const pnl = position?.unrealizedPnlUsdc != null ? Number(position.unrealizedPnlUsdc) : null;

  return (
    <ModalShell open={position != null} onClose={busy ? () => {} : onClose}>
      {position ? (
        <div className="p-1">
          <div className="ws-display text-[18px]">Close position</div>
          <p className="mt-1 text-[12.5px] font-normal text-white/50">
            Sends a market order to close your entire {position.side} position at the current price.
          </p>

          <div className="ws-inset mt-4 flex flex-col gap-2 p-4 text-[12.5px]">
            <div className="flex justify-between">
              <span className="text-white/55">Side</span>
              <span className={position.side === "long" ? "text-up" : "text-down"}>
                {position.side === "long" ? "LONG" : "SHORT"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/55">Size</span>
              <span className="tnum text-white">{formatAmount(Number(position.size))}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/55">Entry price</span>
              <span className="tnum text-white">{position.entryPrice}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/55">Mark price</span>
              <span className="tnum text-white">{position.markPrice ?? "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/55">Unrealized PnL</span>
              <span
                className={`tnum font-semibold ${pnl != null && pnl >= 0 ? "text-up" : "text-down"}`}
              >
                {pnl != null ? `${pnl >= 0 ? "+" : ""}${formatAmount(pnl)} USDC` : "—"}
              </span>
            </div>
          </div>

          {error ? <p className="text-down mt-3 text-[12px] font-normal">{error}</p> : null}

          <button
            onClick={() => void handleConfirm()}
            disabled={busy}
            className="bg-down text-down-ink mt-4 flex w-full cursor-pointer items-center justify-center gap-2 rounded-[14px] p-[15px] text-[15px] font-semibold transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? (
              <>
                <ButtonSpinner />
                Closing…
              </>
            ) : (
              "Confirm close"
            )}
          </button>
        </div>
      ) : null}
    </ModalShell>
  );
}
