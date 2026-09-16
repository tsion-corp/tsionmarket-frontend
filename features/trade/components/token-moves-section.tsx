"use client";

import { useCallback, useMemo } from "react";
import { TokenMoves } from "@/features/trade/components/token-moves";
import { useSpotMarkets } from "@/features/trade/hooks/use-spot-markets";
import type { BuyPayload } from "@/lib/modal-types";

// "Stay Ahead of Token Moves" — the phone home's biggest-movers insight
// carousel. Its own section, so it can sit in the mobile home on its own. The cards are driven by the largest 24h movers, so any token can
// surface here.
export function TokenMovesSection({ onOpenBuy }: { onOpenBuy?: (buy: BuyPayload) => void }) {
  const { markets } = useSpotMarkets();

  const insightTokens = useMemo(
    () =>
      markets
        .filter((m) => m.priceUsd > 0)
        .slice()
        .sort((a, b) => Math.abs(b.change24h) - Math.abs(a.change24h))
        .slice(0, 5)
        .map((m) => ({
          symbol: m.symbol,
          name: m.name,
          logo: m.logo,
          priceUsd: m.priceUsd,
          change24h: m.change24h,
        })),
    [markets]
  );

  // A card's Buy pill opens the app's buy sheet for that token, priced from the
  // spot feed (the sheet refreshes the quote itself).
  const buyToken = useCallback(
    (symbol: string) => {
      if (!onOpenBuy) return;
      const m = markets.find((x) => x.symbol.toUpperCase() === symbol.toUpperCase());
      onOpenBuy({
        symbol,
        name: m?.name ?? symbol,
        priceUsd: m?.priceUsd ?? 0,
        logo: m?.logo ?? null,
      });
    },
    [markets, onOpenBuy]
  );

  // TokenMoves carries no padding of its own (on new-approach it inherited it
  // from the perps section's p-4), so give the phone home's gutter here. The
  // cards are 88% wide, so the right edge still shows the next card's peek.
  return (
    <div className="px-4 pt-2">
      <TokenMoves tokens={insightTokens} onBuyToken={buyToken} />
    </div>
  );
}
