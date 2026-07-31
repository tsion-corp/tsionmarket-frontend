"use client";

import { useCallback, useMemo } from "react";
import { SimplePerps } from "@/components/dashboard/trade/simple-perps";
import { ProPerps } from "@/components/dashboard/trade/pro-perps";
import { usePerpMode } from "@/components/dashboard/trade/perp-mode";
import { usePerpPairs, usePerpPrices } from "@/hooks/use-perp-markets";
import { usePerpPriceStream } from "@/hooks/use-perp-price-stream";
import { usePrices } from "@/hooks/use-prices";
import { pairSymbol } from "@/lib/perp/logic";
import { TRADE_PRICE_SYMBOLS } from "@/lib/trade/assets";
import type { PerpPair } from "@/lib/perp/types";

// The perpetuals body: one data layer, two interfaces (simple/pro) chosen by the
// shared perp-mode store. Rendered inside the trade hub, which owns the section
// header, the Spot/Perpetuals tabs, and the simple/pro switch.
//
// While the perp gateway is not deployed it still renders: a small synthesized
// pair set stands in for /pairs, prices fall back to the app's CoinGecko feed for
// the majors, and every trade action is disabled with an honest label. The moment
// the gateway responds, the same components run live with no code change.

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
  minPositionUsdc: "100",
  spread: { min: 0, max: 0 },
  maxLongOiP: 0,
  maxShortOiP: 0,
}));

export function PerpsView() {
  const { mode } = usePerpMode();
  const { pairs, unavailable, loading } = usePerpPairs();
  const live = !unavailable && pairs.length > 0;
  // Live marks are pushed over the ws-gateway socket; REST /prices seeds the
  // first paint and keeps ticking as a fallback (slowed while the stream is
  // healthy). The gateway's price publisher is not live in production yet, so
  // today the REST path carries the section; the socket takes over on its own
  // the moment frames start flowing.
  const streamSymbols = useMemo(() => (live ? pairs.map(pairSymbol) : []), [live, pairs]);
  const stream = usePerpPriceStream(streamSymbols, live);
  const { prices: livePrices } = usePerpPrices(live, stream.healthy);
  const fallbackPrices = usePrices(TRADE_PRICE_SYMBOLS);

  const effectivePairs = live ? pairs : FALLBACK_PAIRS;

  // One price lookup for both interfaces: the streamed Pyth mark first, the
  // REST-polled mark next, the CoinGecko feed for the fallback majors last.
  const priceOf = useCallback(
    (symbol: string): string | null => {
      if (stream.healthy) {
        const streamed = stream.prices.get(symbol)?.price;
        if (streamed != null) return streamed;
      }
      const livePrice = livePrices.get(symbol)?.price;
      if (livePrice != null) return livePrice;
      const base = symbol.split("/")[0];
      const fallback = fallbackPrices[base];
      return fallback != null && fallback > 0 ? String(fallback) : null;
    },
    [stream, livePrices, fallbackPrices]
  );

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
}
