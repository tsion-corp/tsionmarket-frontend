"use client";

import { useEffect, useState, type ReactNode } from "react";
import { FlashPrice } from "@/features/trade/components/flash-price";
import { formatCompactUsd, formatUsd } from "@/lib/trade/math";
import { useHyperliquidAssetContext } from "@/features/trade/hooks/use-hyperliquid-asset-context";

interface HyperliquidMarketHeaderProps {
  symbol: string;
  // Shown for "Mark" until the WS asset-context subscription connects, so
  // the header isn't blank on first paint — same REST price the rest of the
  // pro view already has on hand.
  fallbackMarkPrice: number;
  /** HyperliquidAssetPicker rendered `compact`, as the header's own leading
   *  market-select trigger — matches Hyperliquid's own single-strip layout
   *  instead of a separate picker card above the chart. */
  assetPicker: ReactNode;
}

// Hyperliquid settles funding hourly, on the hour — this is purely a
// client-side clock, not a value the WS feed reports.
function useFundingCountdown(): string {
  const [label, setLabel] = useState("--:--");

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const elapsedMs = (now.getMinutes() * 60 + now.getSeconds()) * 1000 + now.getMilliseconds();
      const remainingSeconds = Math.max(0, Math.floor((60 * 60 * 1000 - elapsedMs) / 1000));
      const minutes = String(Math.floor(remainingSeconds / 60)).padStart(2, "0");
      const seconds = String(remainingSeconds % 60).padStart(2, "0");
      setLabel(`${minutes}:${seconds}`);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, []);

  return label;
}

// The pro view's market stats strip — mark/oracle/24h change/volume/open
// interest/funding, all fed by the live activeAssetCtx WebSocket
// subscription (use-hyperliquid-asset-context.ts) rather than a REST poll.
export function HyperliquidMarketHeader({
  symbol,
  fallbackMarkPrice,
  assetPicker,
}: HyperliquidMarketHeaderProps) {
  const { context } = useHyperliquidAssetContext(symbol || null);
  const countdown = useFundingCountdown();

  const markPrice = context?.markPrice ?? fallbackMarkPrice;
  const change =
    context && context.prevDayPrice > 0
      ? ((context.markPrice - context.prevDayPrice) / context.prevDayPrice) * 100
      : null;
  const fundingPct = context ? context.fundingRate * 100 : null;
  const openInterestUsd = context && markPrice > 0 ? context.openInterest * markPrice : null;

  const stats: { label: string; value: ReactNode }[] = [
    {
      label: "Mark",
      value: (
        <FlashPrice value={markPrice} className="ws-display tnum text-[14px]">
          {markPrice > 0 ? formatUsd(markPrice) : "—"}
        </FlashPrice>
      ),
    },
    {
      label: "Oracle",
      value: (
        <span className="tnum text-[14px] text-white">
          {context ? formatUsd(context.oraclePrice) : "—"}
        </span>
      ),
    },
    {
      label: "24h Change",
      value: (
        <span
          className={`tnum text-[14px] font-medium ${
            change == null ? "text-white" : change >= 0 ? "text-up" : "text-down"
          }`}
        >
          {change != null ? `${change >= 0 ? "+" : ""}${change.toFixed(2)}%` : "—"}
        </span>
      ),
    },
    {
      label: "24h Volume",
      value: (
        <span className="tnum text-[14px] text-white">
          {context ? formatCompactUsd(context.dayVolumeUsd) : "—"}
        </span>
      ),
    },
    {
      label: "Open Interest",
      value: (
        <span className="tnum text-[14px] text-white">
          {openInterestUsd != null ? formatCompactUsd(openInterestUsd) : "—"}
        </span>
      ),
    },
    {
      label: "Funding / Countdown",
      value: (
        <span className="tnum text-[14px] text-white">
          {fundingPct != null ? `${fundingPct >= 0 ? "+" : ""}${fundingPct.toFixed(4)}%` : "—"}
          <span className="ml-1.5 text-white/45">{countdown}</span>
        </span>
      ),
    },
  ];

  return (
    <div className="ws-card flex flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 sm:px-5">
      {assetPicker}
      <div className="hidden h-8 w-px bg-white/10 sm:block" />
      {stats.map((stat) => (
        <div key={stat.label} className="flex flex-col gap-0.5">
          <span className="text-[11px] font-normal text-white/55 underline decoration-white/25 decoration-dotted underline-offset-2">
            {stat.label}
          </span>
          {stat.value}
        </div>
      ))}
    </div>
  );
}
