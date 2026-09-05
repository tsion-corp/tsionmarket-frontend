"use client";

import { useEffect, useState } from "react";
import { friendlyError } from "@/lib/errors";
import type { HlOrderRow } from "@/features/trade/lib/hyperliquid-types";

interface HyperliquidOrdersListProps {
  orders: HlOrderRow[];
  loading: boolean;
  busy: boolean;
  onCancel: (order: HlOrderRow) => Promise<void>;
}

// Once an order settles (filled, cancelled, rejected) there's nothing left
// to do with it here — a fill already shows up in Positions, and once that
// position closes it shows up in History. Keeping it around just clutters
// this panel with rows that can no longer be acted on, so this panel only
// ever shows resting orders — which happen to be exactly the cancellable ones.
const CANCELLABLE_STATUSES = new Set(["submitted", "open", "partially_filled"]);
// Orders arrive newest-first; capped so a wallet with a long resting-order
// history doesn't turn this into a scroll of its own.
const MAX_VISIBLE = 4;

export function HyperliquidOrdersList({
  orders,
  loading,
  busy,
  onCancel,
}: HyperliquidOrdersListProps) {
  const visibleOrders = orders
    .filter((o) => CANCELLABLE_STATUSES.has(o.status))
    .slice(0, MAX_VISIBLE);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [cancelError, setCancelError] = useState<{ id: string; message: string } | null>(null);

  // Clears itself a few seconds after it appears — never while a cancel is
  // actually in flight, only once the message has actually settled.
  useEffect(() => {
    if (!cancelError || cancellingId) return;
    const timer = setTimeout(() => setCancelError(null), 6000);
    return () => clearTimeout(timer);
  }, [cancelError, cancellingId]);

  const handleCancel = async (order: HlOrderRow) => {
    setConfirmingId(null);
    setCancellingId(order.id);
    setCancelError(null);
    try {
      await onCancel(order);
    } catch (error) {
      setCancelError({
        id: order.id,
        message: friendlyError(error, "Couldn't cancel this order."),
      });
    } finally {
      setCancellingId(null);
    }
  };

  return (
    <div className="ws-card p-4 sm:p-5" data-sensitive="position">
      <div className="mb-3 text-xs font-normal text-white/55">Orders</div>
      {loading ? (
        <p className="text-xs font-normal text-white/45">Loading…</p>
      ) : visibleOrders.length === 0 ? (
        <p className="text-xs font-normal text-white/45">No orders.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {visibleOrders.map((order) => {
            const cancellable =
              CANCELLABLE_STATUSES.has(order.status) && order.externalOrderId != null;
            const cancelling = cancellingId === order.id;
            const confirming = confirmingId === order.id;
            return (
              <div key={order.id} className="ws-inset flex flex-col gap-1.5 p-3 text-[12.5px]">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${
                        order.side === "buy" ? "bg-up/16 text-up" : "bg-down/14 text-down"
                      }`}
                    >
                      {order.side.toUpperCase()}
                    </span>
                    <span className="text-white/70">{order.orderType}</span>
                    <span className="tnum text-white">{order.size}</span>
                    {order.limitPrice ? (
                      <span className="text-white/45">@ {order.limitPrice}</span>
                    ) : null}
                    {order.reduceOnly ? <span className="text-white/35">reduce-only</span> : null}
                  </div>
                  <div className="flex items-center gap-2.5">
                    {!confirming ? (
                      <span className="text-white/45">
                        {cancelling ? "cancelling…" : order.status}
                      </span>
                    ) : null}
                    {cancellable ? (
                      confirming ? (
                        <div className="flex items-center gap-1.5">
                          <span className="text-white/45">Cancel this order?</span>
                          <button
                            onClick={() => setConfirmingId(null)}
                            className="cursor-pointer rounded-lg bg-white/8 px-2.5 py-1 text-[11px] font-semibold text-white/70 transition-colors hover:bg-white/14"
                          >
                            Keep
                          </button>
                          <button
                            onClick={() => void handleCancel(order)}
                            disabled={busy || cancelling}
                            className="bg-down text-down-ink cursor-pointer rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            Confirm
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmingId(order.id)}
                          disabled={busy || cancelling}
                          className="hover:bg-down/16 hover:text-down cursor-pointer rounded-lg bg-white/8 px-2.5 py-1 text-[11px] font-semibold text-white/80 transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Cancel
                        </button>
                      )
                    ) : null}
                  </div>
                </div>
                {cancelError?.id === order.id ? (
                  <p className="text-down text-[11px] font-normal">{cancelError.message}</p>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
