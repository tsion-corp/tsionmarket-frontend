"use client";

import { useState } from "react";
import { formatAmount } from "@/lib/trade/math";
import { HyperliquidClosePositionModal } from "@/features/trade/components/hyperliquid-close-position-modal";
import { HyperliquidHistoryModal } from "@/features/trade/components/hyperliquid-history-modal";
import { HyperliquidPnlShareModal } from "@/features/trade/components/hyperliquid-pnl-share-modal";
import {
  HyperliquidTriggerModal,
  type TriggerModalTarget,
} from "@/features/trade/components/hyperliquid-trigger-modal";
import { listClosedPositions } from "@/features/trade/lib/hyperliquid-api";
import type {
  HlClosedPositionView,
  HlOrderRow,
  HlPositionView,
  HlTriggerKind,
} from "@/features/trade/lib/hyperliquid-types";

interface HyperliquidPositionsListProps {
  positions: HlPositionView[];
  orders: HlOrderRow[];
  loading: boolean;
  busy: boolean;
  walletId: string | null;
  onClosePosition: (position: HlPositionView, siblingOrderIdsToCancel: string[]) => Promise<void>;
  onEditTrigger: (
    position: HlPositionView,
    kind: HlTriggerKind,
    triggerPrice: string,
    existingOrderId: string | undefined
  ) => Promise<void>;
}

const RESTING_STATUSES = new Set(["submitted", "open", "partially_filled"]);

// How long to keep looking for the just-closed position's final record (with
// its real fill price and PnL) before giving up on the auto-popup. When the
// WS fill event lands this is a second or two — but a missed fill is only
// caught by the backend's reconciliation sweep (60s cadence), so the window
// must outlast a full sweep or the popup never fires for exactly the closes
// that need it most (observed live: close filled instantly, record written
// 34s later by reconciliation). The card stays reachable from Trading
// history either way; a timeout costs nothing but the popup.
const SHARE_CARD_POLL_TIMEOUT_MS = 90_000;
const SHARE_CARD_POLL_INTERVAL_MS = 1_000;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function findTrigger(
  orders: HlOrderRow[],
  position: HlPositionView,
  kind: HlTriggerKind
): HlOrderRow | undefined {
  return orders.find(
    (o) =>
      o.parentOrderId === position.entryOrderId &&
      o.orderType === kind &&
      RESTING_STATUSES.has(o.status)
  );
}

export function HyperliquidPositionsList({
  positions,
  orders,
  loading,
  busy,
  walletId,
  onClosePosition,
  onEditTrigger,
}: HyperliquidPositionsListProps) {
  const [closing, setClosing] = useState<HlPositionView | null>(null);
  const [shareCard, setShareCard] = useState<HlClosedPositionView | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [triggerTarget, setTriggerTarget] = useState<TriggerModalTarget | null>(null);

  const openTriggerModal = (position: HlPositionView, kind: HlTriggerKind) => {
    const existing = findTrigger(orders, position, kind);
    setTriggerTarget({
      position,
      kind,
      existingPrice: existing?.limitPrice ?? null,
      existingOrderId: existing?.id,
    });
  };

  // After a close is accepted, the position's final record (real fill price,
  // realized PnL) is written by the fill event a moment later — poll for it
  // and pop the share card the instant it exists. Fire-and-forget: the close
  // modal must not wait on this, and a timeout just means no popup (the card
  // stays available from Trading history).
  const offerShareCard = async (positionId: string) => {
    if (!walletId) return;
    const deadline = Date.now() + SHARE_CARD_POLL_TIMEOUT_MS;
    while (Date.now() < deadline) {
      const closed = await listClosedPositions(walletId).catch(() => []);
      const match = closed.find((p) => p.id === positionId);
      if (match) {
        setShareCard(match);
        return;
      }
      await delay(SHARE_CARD_POLL_INTERVAL_MS);
    }
  };

  const confirmClose = async (position: HlPositionView) => {
    const siblingIds = orders
      .filter(
        (o) =>
          o.parentOrderId === position.entryOrderId &&
          (o.orderType === "take_profit" || o.orderType === "stop_loss") &&
          RESTING_STATUSES.has(o.status)
      )
      .map((o) => o.id);
    // The poll starts the moment the user confirms, CONCURRENT with the
    // close round trip — the closed record can only exist after the fill
    // lands, so early polling is harmless, and the card pops the second
    // the record appears instead of after the whole close flow settles.
    void offerShareCard(position.id);
    await onClosePosition(position, siblingIds);
  };

  return (
    <div className="ws-card p-4 sm:p-5" data-sensitive="position">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-normal text-white/55">Open positions</span>
        <button
          onClick={() => setHistoryOpen(true)}
          disabled={!walletId}
          className="cursor-pointer rounded-full border border-white/14 bg-white/6 px-3 py-1 text-[11.5px] font-medium text-white/70 transition-colors hover:border-white/25 hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          History
        </button>
      </div>
      {loading ? (
        <p className="text-xs font-normal text-white/45">Loading…</p>
      ) : positions.length === 0 ? (
        <p className="text-xs font-normal text-white/45">No open positions.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {positions.map((position) => {
            const pnl =
              position.unrealizedPnlUsdc != null ? Number(position.unrealizedPnlUsdc) : null;
            const takeProfit = findTrigger(orders, position, "take_profit");
            const stopLoss = findTrigger(orders, position, "stop_loss");

            return (
              <div key={position.id} className="ws-inset flex flex-col gap-2 p-3 text-[12.5px]">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${
                        position.side === "long" ? "bg-up/16 text-up" : "bg-down/14 text-down"
                      }`}
                    >
                      {position.side === "long" ? "LONG" : "SHORT"}
                    </span>
                    <span className="tnum text-white">{formatAmount(Number(position.size))}</span>
                    <span className="text-white/45">@ {position.entryPrice}</span>
                    <span className="text-white/45">
                      {position.leverage}x {position.marginMode}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-white/45">mark {position.markPrice ?? "—"}</span>
                    <span
                      className={`tnum font-semibold ${pnl != null && pnl >= 0 ? "text-up" : "text-down"}`}
                    >
                      {pnl != null ? `${pnl >= 0 ? "+" : ""}${formatAmount(pnl)} USDC` : "—"}
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => openTriggerModal(position, "take_profit")}
                    className={`cursor-pointer rounded-lg px-2.5 py-1 text-[11px] font-medium transition-colors ${
                      takeProfit
                        ? "bg-up/12 text-up"
                        : "bg-white/6 text-white/45 hover:text-white/70"
                    }`}
                  >
                    {/* limitPrice is nullable on the row — "TP set" beats rendering "TP @ null". */}
                    {takeProfit
                      ? takeProfit.limitPrice
                        ? `TP @ ${takeProfit.limitPrice}`
                        : "TP set"
                      : "Add TP"}
                  </button>
                  <button
                    onClick={() => openTriggerModal(position, "stop_loss")}
                    className={`cursor-pointer rounded-lg px-2.5 py-1 text-[11px] font-medium transition-colors ${
                      stopLoss
                        ? "bg-down/12 text-down"
                        : "bg-white/6 text-white/45 hover:text-white/70"
                    }`}
                  >
                    {stopLoss
                      ? stopLoss.limitPrice
                        ? `SL @ ${stopLoss.limitPrice}`
                        : "SL set"
                      : "Add SL"}
                  </button>
                  <button
                    onClick={() => setClosing(position)}
                    disabled={busy}
                    className="hover:bg-down/16 hover:text-down ml-auto cursor-pointer rounded-lg bg-white/8 px-2.5 py-1 text-[11px] font-semibold text-white/80 transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Close
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <HyperliquidClosePositionModal
        position={closing}
        onClose={() => setClosing(null)}
        onConfirm={confirmClose}
      />
      <HyperliquidHistoryModal
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        walletId={walletId}
      />
      <HyperliquidPnlShareModal
        open={shareCard !== null}
        onClose={() => setShareCard(null)}
        position={shareCard}
      />
      <HyperliquidTriggerModal
        target={triggerTarget}
        onClose={() => setTriggerTarget(null)}
        onSave={(position, kind, price, existingOrderId) =>
          onEditTrigger(position, kind, price, existingOrderId)
        }
      />
    </div>
  );
}
