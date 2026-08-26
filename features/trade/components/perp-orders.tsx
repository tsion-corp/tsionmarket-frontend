"use client";

import { useTranslations } from "next-intl";
import { PerpPairIcon } from "@/features/trade/components/perp-pair-icon";
import { formatUsd } from "@/lib/trade/math";
import { isUnsetLevel, pairSymbol } from "@/lib/perp/logic";
import type { PerpOrder, PerpPair } from "@/lib/perp/types";

// Pending limit/stop orders (pro view). Each row shows the trigger the keeper
// is watching and offers cancel, the one management action a resting order
// has. Nothing here renders while the list is empty: an empty pending panel
// would be noise for the majority who trade at market.

interface PerpOrdersProps {
  orders: PerpOrder[];
  pairByIndex: Map<number, PerpPair>;
  onCancel: (order: PerpOrder) => void;
  busy: boolean;
}

export function PerpOrders({ orders, pairByIndex, onCancel, busy }: PerpOrdersProps) {
  const t = useTranslations("perps");
  if (orders.length === 0) return null;

  return (
    <div className="ws-card overflow-hidden" data-sensitive="position">
      <div className="flex items-center justify-between px-4 pt-4 pb-3 sm:px-5">
        <span className="ws-display text-[18px]">{t("pendingOrders")}</span>
        <span className="text-[12px] font-normal text-white/45">
          {t("openCount", { n: orders.length })}
        </span>
      </div>
      {orders.map((o) => {
        const pair = pairByIndex.get(o.pairIndex);
        const symbol = pair ? pairSymbol(pair) : `#${o.pairIndex}`;
        return (
          <div
            key={`${o.pairIndex}:${o.index}`}
            className="flex flex-wrap items-center gap-3 border-t border-white/6 px-4 py-3 sm:px-5"
          >
            <PerpPairIcon sym={pair?.from ?? "?"} category={pair?.category} size={30} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 font-sans text-[14px] font-semibold">
                {symbol}
                <span
                  className={`rounded-full border px-2 py-0.5 text-[10.5px] font-medium uppercase ${
                    o.isLong
                      ? "border-up/35 bg-up/12 text-up"
                      : "border-down/35 bg-down/12 text-down"
                  }`}
                >
                  {o.isLong ? t("long") : t("short")} {parseFloat(o.leverage)}x
                </span>
              </div>
              <div className="tnum mt-0.5 text-[12px] font-normal text-white/50">
                {t("orderTriggerLine", {
                  margin: formatUsd(parseFloat(o.collateralUsdc)),
                  price: formatUsd(parseFloat(o.price)),
                })}
                {!isUnsetLevel(o.takeProfit)
                  ? ` · ${t("tpAt", { price: formatUsd(parseFloat(o.takeProfit)) })}`
                  : ""}
                {!isUnsetLevel(o.stopLoss)
                  ? ` · ${t("slAt", { price: formatUsd(parseFloat(o.stopLoss)) })}`
                  : ""}
              </div>
            </div>
            <button
              onClick={() => onCancel(o)}
              disabled={busy}
              className="cursor-pointer rounded-lg border border-white/14 bg-white/8 px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-white/12 disabled:opacity-50"
            >
              {t("cancelOrder")}
            </button>
          </div>
        );
      })}
    </div>
  );
}
