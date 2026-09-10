import { PERP_MAJOR_SYMBOLS, pairSymbol } from "@/lib/perp/logic";
import type { PerpPair, PerpPrice } from "@/lib/perp/types";

// The dashboard's perps brief as one pure composition, shared by the browser
// and the dashboard feed on the server: the majors, with the gateway's mark
// where it has one and the app's CoinGecko price where it does not, and the
// leverage each can be taken to.

export interface PerpBriefRow {
  /** Pair label, e.g. "BTC/USD". */
  symbol: string;
  /** Base asset, for the icon and the price fallback lookup. */
  base: string;
  priceUsd: number;
  maxLeverage: number;
}

// The gateway is the authority on leverage; the fallback figure is the
// platform maximum, which every major carries.
const FALLBACK_MAX_LEVERAGE = 50;

/** The bases whose CoinGecko price the brief may fall back to. */
export function perpBriefFallbackSymbols(count: number): string[] {
  return PERP_MAJOR_SYMBOLS.slice(0, count).map((s) => s.split("/")[0]);
}

export function composePerpBrief(
  pairs: PerpPair[],
  marks: PerpPrice[],
  fallback: Record<string, number>,
  count: number
): PerpBriefRow[] {
  const pairBySymbol = new Map<string, PerpPair>();
  for (const p of pairs) pairBySymbol.set(pairSymbol(p), p);
  const markBySymbol = new Map<string, PerpPrice>();
  for (const m of marks) markBySymbol.set(m.pair, m);

  return PERP_MAJOR_SYMBOLS.slice(0, count).map((symbol) => {
    const base = symbol.split("/")[0];
    const mark = markBySymbol.get(symbol)?.price;
    return {
      symbol,
      base,
      priceUsd: mark != null ? Number(mark) : (fallback[base] ?? 0),
      maxLeverage: pairBySymbol.get(symbol)?.maxLeverage ?? FALLBACK_MAX_LEVERAGE,
    };
  });
}
