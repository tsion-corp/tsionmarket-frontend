"use client";

import { useCallback, useMemo } from "react";
import { Eyebrow } from "@/components/ui/eyebrow";
import { PerpModeSwitch, usePerpMode } from "@/components/dashboard/trade/perp-mode";
import { SimplePerps } from "@/components/dashboard/trade/simple-perps";
import { ProPerps } from "@/components/dashboard/trade/pro-perps";
import { usePerpPairs, usePerpPrices } from "@/hooks/use-perp-markets";
import { usePrices } from "@/hooks/use-prices";
import { TRADE_PRICE_SYMBOLS } from "@/lib/trade/assets";
import type { PerpPair } from "@/lib/perp/types";

// The perpetuals section. One data layer, two interfaces: the simple/pro
// switch is a persisted preference (see perp-mode), defaulting to simple.
//
// While the perp gateway is not deployed the section still renders: a small
// synthesized pair set stands in for /pairs, prices fall back to the app's
// CoinGecko feed for the majors, and every trade action is disabled with an
// honest label. The moment the gateway responds, the same components run live
// with no code change.

const FALLBACK_PAIRS: PerpPair[] = [
  ["BTC", 0],
  ["ETH", 1],
  ["SOL", 2],
].map(([from, pairIndex]) => ({
  pairIndex: pairIndex as number,
  from: from as string,
  to: "USD",
  groupIndex: 0,
  group: "CRYPTO1",
  category: "crypto",
  feeIndex: 0,
  maxLeverage: 50,
  spread: { min: 0, max: 0 },
  maxLongOiP: 0,
  maxShortOiP: 0,
}));

export function TradeSection() {
  const { mode } = usePerpMode();
  const { pairs, unavailable, loading } = usePerpPairs();
  const live = !unavailable && pairs.length > 0;
  const { prices: livePrices } = usePerpPrices(live);
  const fallbackPrices = usePrices(TRADE_PRICE_SYMBOLS);

  const effectivePairs = live ? pairs : FALLBACK_PAIRS;

  // One price lookup for both interfaces: the gateway's Pyth mark when live,
  // the CoinGecko feed for the fallback majors otherwise.
  const priceOf = useCallback(
    (symbol: string): string | null => {
      const livePrice = livePrices.get(symbol)?.price;
      if (livePrice != null) return livePrice;
      const base = symbol.split("/")[0];
      const fallback = fallbackPrices[base];
      return fallback != null && fallback > 0 ? String(fallback) : null;
    },
    [livePrices, fallbackPrices]
  );

  const body = useMemo(() => {
    if (loading) {
      return (
        <div className="ws-card flex items-center justify-center p-16">
          <div className="h-5 w-44 animate-pulse rounded bg-white/8" />
        </div>
      );
    }
    return mode === "pro" ? (
      <ProPerps pairs={effectivePairs} priceOf={priceOf} live={live} />
    ) : (
      <SimplePerps pairs={effectivePairs} priceOf={priceOf} live={live} />
    );
  }, [loading, mode, effectivePairs, priceOf, live]);

  return (
    <div className="mx-auto w-full max-w-[1520px] p-4 sm:p-6 lg:p-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Eyebrow>Perpetuals</Eyebrow>
          <h2 className="ws-display mt-3.5 text-[32px] tracking-[-0.01em]">Perpetuals</h2>
        </div>
        <PerpModeSwitch />
      </div>

      <div className="mt-4">{body}</div>
    </div>
  );
}
