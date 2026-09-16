"use client";

import { useState } from "react";
import { ModalShell } from "@/components/ui/modal-shell";
import { AssetIcon } from "@/components/ui/asset-icon";
import { tokenBg } from "@/lib/trade/assets";
import { formatAmount, formatUsd } from "@/lib/trade/math";
import { useHyperliquidClosedPositions } from "@/features/trade/hooks/use-hyperliquid-closed-positions";
import { HyperliquidPnlShareModal } from "@/features/trade/components/hyperliquid-pnl-share-modal";
import type { HlClosedPositionView } from "@/features/trade/lib/hyperliquid-types";

interface HyperliquidHistoryModalProps {
  open: boolean;
  onClose: () => void;
  walletId: string | null;
}

const CLOSE_REASON_LABEL: Record<HlClosedPositionView["closeReason"], string> = {
  take_profit: "Take profit",
  stop_loss: "Stop loss",
  manual_close: "Manual close",
  liquidation: "Liquidated",
  reconciled: "Closed",
};

// Duration held, coarse on purpose — a history row needs "how long", not a
// stopwatch. Falls back to the smaller unit once it would otherwise round to 0.
function formatDuration(openedAt: string, closedAt: string): string {
  const ms = new Date(closedAt).getTime() - new Date(openedAt).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${Math.max(minutes, 1)}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

function formatTimestamp(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function HyperliquidHistoryModal({ open, onClose, walletId }: HyperliquidHistoryModalProps) {
  const { positions, loading, error } = useHyperliquidClosedPositions(walletId, open);
  const [sharing, setSharing] = useState<HlClosedPositionView | null>(null);

  return (
    <ModalShell open={open} onClose={onClose} size="lg">
      <div className="p-5 sm:p-6">
        <div className="ws-display text-[20px]">Trading history</div>
        <p className="mt-1 text-[12.5px] leading-[1.5] font-normal text-white/50">
          Your closed positions, newest first.
        </p>

        {loading ? (
          <p className="mt-5 text-[13px] font-normal text-white/50">Loading…</p>
        ) : error ? (
          <p className="mt-5 text-[13px] font-normal text-white/50">
            Couldn&apos;t load your history. Try again later.
          </p>
        ) : positions.length > 0 ? (
          <div className="mt-4 flex max-h-[60vh] flex-col divide-y divide-white/6 overflow-y-auto">
            {positions.map((position) => {
              const pnl = Number(position.realizedPnlUsdc);
              const isWin = pnl >= 0;

              return (
                <div key={position.id} className="flex flex-col gap-2 px-1 py-3.5 first:pt-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <AssetIcon
                        sym={position.symbol}
                        bg={tokenBg(position.symbol)}
                        size={26}
                        fallback="gradient"
                      />
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[13.5px] font-medium text-white/90">
                            {position.symbol}
                          </span>
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10.5px] font-semibold ${
                              position.side === "long" ? "bg-up/16 text-up" : "bg-down/14 text-down"
                            }`}
                          >
                            {position.side === "long" ? "LONG" : "SHORT"}
                          </span>
                          <span className="text-[11px] font-normal text-white/40">
                            {position.leverage}x {position.marginMode}
                          </span>
                        </div>
                        <div className="mt-0.5 text-[11.5px] font-normal text-white/35">
                          {formatTimestamp(position.openedAt)} →{" "}
                          {formatTimestamp(position.closedAt)}
                          <span className="text-white/25">
                            {" "}
                            · {formatDuration(position.openedAt, position.closedAt)}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div
                        className={`tnum text-[14.5px] font-semibold ${isWin ? "text-up" : "text-down"}`}
                      >
                        {isWin ? "+" : ""}
                        {formatUsd(pnl)}
                      </div>
                      <div className="mt-0.5 text-[11px] font-normal text-white/35">
                        {CLOSE_REASON_LABEL[position.closeReason]}
                      </div>
                    </div>
                  </div>

                  <div className="ws-inset flex items-center justify-between px-3 py-2 text-[12px]">
                    <div className="flex items-center gap-4">
                      <div>
                        <span className="text-white/45">Size </span>
                        <span className="tnum text-white/85">
                          {formatAmount(Number(position.size))}
                        </span>
                      </div>
                      <div>
                        <span className="text-white/45">Entry </span>
                        <span className="tnum text-white/85">{position.entryPrice}</span>
                      </div>
                      <div>
                        <span className="text-white/45">Close </span>
                        <span className="tnum text-white/85">{position.closePrice}</span>
                      </div>
                    </div>
                    <button
                      onClick={() => setSharing(position)}
                      className="cursor-pointer rounded-lg bg-white/8 px-2.5 py-1 text-[11px] font-semibold text-white/80 transition-colors hover:bg-white/14 hover:text-white"
                    >
                      Share
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="mt-5 rounded-[14px] border border-white/8 bg-white/3 px-4 py-6 text-center">
            <p className="text-[13px] font-normal text-white/55">No closed positions yet.</p>
            <p className="mt-1 text-[12px] font-normal text-white/35">
              Trades you close will show up here.
            </p>
          </div>
        )}
      </div>
      <HyperliquidPnlShareModal
        open={sharing !== null}
        onClose={() => setSharing(null)}
        position={sharing}
      />
    </ModalShell>
  );
}
