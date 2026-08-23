"use client";

import { useCallback, useMemo, useState } from "react";
import { SimplePerps } from "@/features/trade/components/simple-perps";
import { ProPerps } from "@/features/trade/components/pro-perps";
import { usePerpMode } from "@/features/trade/components/perp-mode";
import { usePerpPrefill } from "@/features/trade/hooks/use-perp-prefill";
import { usePerpPairs, usePerpPrices } from "@/features/trade/hooks/use-perp-markets";
import { usePerpPriceStream } from "@/features/trade/hooks/use-perp-price-stream";
import { usePrices } from "@/hooks/use-prices";
import { pairSymbol, toWirePrice } from "@/lib/perp/logic";
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
  ["BNB", 3],
  ["DOGE", 4],
  ["AAVE", 5],
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

// The majors the simple interface offers, priced from CoinGecko while the perp
// gateway is not answering. TRADE_PRICE_SYMBOLS covers what the app can swap,
// which is not the same set: BNB, DOGE and AAVE are perp markets here without
// being spot assets we hold.
const FALLBACK_PRICE_SYMBOLS = [...new Set([...TRADE_PRICE_SYMBOLS, "BNB", "DOGE", "AAVE"])];

export function PerpsView() {
  const { mode } = usePerpMode();
  // Which market is being looked at, and whether its trade screen is open, are
  // held here rather than inside either interface. The simple and pro desks are
  // different components, so state living in one is lost the moment the user
  // switches — including from the switch inside the trade screen itself.
  const [selected, setSelected] = useState("ETH/USD");
  const [sheetOpen, setSheetOpen] = useState(false);
  // Voice perps: a spoken "long $2 of bitcoin 30x" lands as URL params, is passed
  // into whichever interface is showing, which STAGES the visible form and then
  // auto-fires its own submit (usePerpFormAutostage) — the user watches the order
  // fill in and place itself.
  const perpPrefill = usePerpPrefill();
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
  const fallbackPrices = usePrices(FALLBACK_PRICE_SYMBOLS);

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
      return fallback != null ? toWirePrice(fallback) : null;
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

  const shared = {
    pairs: effectivePairs,
    priceOf,
    live,
    voicePrefill: perpPrefill,
    selected,
    onSelect: setSelected,
    sheetOpen,
    onSheetOpenChange: setSheetOpen,
  };

  return mode === "pro" ? <ProPerps {...shared} /> : <SimplePerps {...shared} />;
}
