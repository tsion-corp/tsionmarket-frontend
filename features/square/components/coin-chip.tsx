"use client";

import type { TradableSymbol } from "@/lib/square/tradable";

/**
 * The live price behind a coin somebody mentioned.
 *
 * This is the thing Ark can do that a social app cannot. When a post says
 * "$TRUMP is moving again", the reader's next question is *is it though* — and
 * on any other surface that costs leaving the post to go and look. Here the
 * answer sits under the sentence, live, and tapping it opens the trade sheet.
 *
 * It renders only for symbols this app can actually trade, so the chip is
 * always answerable: there is no state where it shows a price you cannot act
 * on. Colour follows the platform's up/down tokens, and carries a sign as well
 * — a red and a green chip must not be the only difference between a gain and
 * a loss for someone who cannot tell them apart.
 */
export function CoinChip({ market, onOpen }: { market: TradableSymbol; onOpen?: () => void }) {
  const up = market.change24h >= 0;
  const move = `${up ? "+" : ""}${market.change24h.toFixed(2)}%`;

  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={!onOpen}
      aria-label={`${market.symbol} ${move}`}
      className="border-grey-800 hover:bg-grey-800 inline-flex items-center gap-2 rounded-lg border bg-black/30 px-2.5 py-1.5 transition-colors disabled:hover:bg-black/30"
    >
      <span className="text-[12.5px] font-semibold text-white">{market.symbol}</span>
      <span className={`text-[12.5px] font-semibold ${up ? "text-up" : "text-down"}`}>{move}</span>
    </button>
  );
}
