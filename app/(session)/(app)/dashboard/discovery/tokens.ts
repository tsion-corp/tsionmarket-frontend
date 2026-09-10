"use client";

import { useMemo, useState } from "react";
import { useMarketTokens } from "@/features/trade/hooks/use-market-tokens";
import type { MarketToken } from "@/lib/market-catalog";
import { isSpotStable } from "@/lib/spot-chart";
import { SPOT_DELISTED } from "@/lib/spot-markets";
import { formatUsd } from "@/lib/trade/math";
import type { TokenSpot } from "@/features/discovery/types";

// Adapter between the market feed and the "Stay Ahead of Token Moves" card,
// the sibling of memecoins.ts and built to the same rules: discovery may not
// import trade, so the route calls the trade slice's hook and hands the card a
// display-ready shape. Every figure is formatted here. The card renders
// strings and a colour flag and never sees a number.
//
// Until this existed the card had no data source at all. The dashboard mounted
// it with no props, so it fell to a hardcoded BTC at $1,876,617 and +12.8%,
// translated into five languages. That was not a rare fallback, it was the only
// thing the card had ever shown.

// The same query key useSpotMarkets already uses, so on a dashboard that also
// shows the square this row costs nothing: React Query serves both callers from
// one entry. On its own it is a single anonymous request the route caches for
// two minutes at the edge.
const POPULAR = "popular";

const DEFAULT_LIMIT = 5;

/**
 * The tokens the spot desk asked the card to feature.
 *
 * The row is ranked by market cap (see `useTokenSpots`), which carries the
 * majors on its own: BTC, ETH, BNB and SOL are all inside the top six by cap on
 * any normal day. It does not carry the rest of the desk's list. HYPE is around
 * tenth and APE is well outside the hundred coins the popular feed returns, so
 * a plain cap ranking would never show either. `holdFeaturedSlots` reserves
 * them a place in the selection instead, the same mechanism the memecoin card
 * uses to get its illustrated tickers on screen.
 *
 * This is a preference, not the contents of the card. Everything here still has
 * to clear `rank`, a named token that is not in the feed is simply not shown,
 * and at most half the row may be held this way, so the rest is whatever the
 * cap ranking gives. Adding a ticker here promotes it if the feed has it;
 * nothing here can put a token on screen that the feed does not carry.
 *
 * Matched on the upper-cased ticker because the feed returns both "PEPE" and
 * "Pepe" for the same coin. The spot keeps whatever casing it arrived with.
 */
const FEATURED_SYMBOLS: ReadonlySet<string> = new Set(["BTC", "ETH", "BNB", "SOL", "HYPE", "APE"]);

// One shared empty result. A load that has not resolved, has failed, or has
// nothing to feature hands the card the same array every render, so the
// rotation timer is not restarted by an empty feed.
const NO_SPOTS: readonly TokenSpot[] = Object.freeze([]);

// Above 100% the decimals are noise in a chip this small, and a four figure
// gain with two of them does not fit. Below it they are the difference between
// a real move and a flat day. Same threshold the memecoin card uses.
const BIG_MOVE_PERCENT = 100;

/**
 * Where a card leads: the token's own spot page, matched on the symbol, which
 * is how /spot/[id] resolves. That page handles a symbol it cannot place with
 * its own not-found state, so a token that has since left the buy list lands on
 * an honest message rather than an empty chart.
 */
function detailHref(symbol: string): string {
  return `/spot/${encodeURIComponent(symbol.toLowerCase())}`;
}

function logo(raw: string | null): string | null {
  if (raw === null) return null;
  const url = raw.trim();
  return /^https?:\/\//i.test(url) ? url : null;
}

/**
 * The move as the card shows it, plus the flag it colours by.
 *
 * `up` follows the rounded figure rather than the raw one, so a token at
 * -0.001% reads "+0.00%" in green instead of "-0.00%" in red.
 */
function formatChange(percent: number): { change: string; movePercent: string; up: boolean } {
  const digits = Math.abs(percent) >= BIG_MOVE_PERCENT ? 0 : 2;
  const rounded = Number(percent.toFixed(digits));
  const up = rounded >= 0;
  const magnitude = Math.abs(rounded).toFixed(digits);
  return {
    change: `${up ? "+" : "-"}${magnitude}%`,
    // The tip's copy supplies its own direction word, so the figure it takes is
    // unsigned.
    movePercent: `${magnitude}%`,
    up,
  };
}

interface RankedSpot {
  spot: TokenSpot;
  marketCap: number;
}

function featured(symbol: string): boolean {
  return FEATURED_SYMBOLS.has(symbol.toUpperCase());
}

/**
 * One token, ranked by market cap, or null when the card will not show it.
 *
 * The cap only orders the row and is never drawn, so a token the feed gives a
 * wrong or missing cap for is mis-sorted at worst. The 24h move is different:
 * it is the figure on the card, so the checks on it are strict.
 *
 * The zero test is the important one, and it is a filter rather than a display
 * decision. `lib/server/market-tokens.ts` maps a missing 24h figure to 0, so at
 * this layer a token CoinGecko published no change for is indistinguishable
 * from one that genuinely did not move, and the card has no honest figure to
 * print for either. In practice a real move is a float and lands on an exact 0
 * essentially never, so what this drops is the feed's no-data rows: today those
 * are FIGR_HELOC and BUIDL, both tokenised funds. A major would have to print
 * an exact 0.00000 to fall out, and if it did, leaving it out for a refresh is
 * the right cost. The alternative is drawing a defaulted zero as if CoinGecko
 * had reported it.
 */
function rank(token: MarketToken): RankedSpot | null {
  const symbol = token.symbol?.trim() ?? "";
  // The symbol is the whole identity of a card this size, and a "?" chip is not
  // a showcase.
  if (symbol === "") return null;
  // Delisted from the buy list, so the card's only exit would dead-end.
  if (SPOT_DELISTED.has(symbol.toUpperCase())) return null;
  // Stablecoins are third and sixth by cap in the popular feed, so ranking by
  // cap walks straight into them. They are not spot markets at all: the desk
  // filters them out of its own universe, so the card's exit would dead-end the
  // same way a delisted token does. A peg holding at $1.00 is also not a move,
  // and the move is the card's subject.
  if (isSpotStable(symbol)) return null;

  const price = token.priceUsd;
  if (!Number.isFinite(price) || price <= 0) return null;

  const percent = token.change24h;
  if (!Number.isFinite(percent) || percent === 0) return null;

  const { change, movePercent, up } = formatChange(percent);
  return {
    // A feed row with no cap sorts last rather than being dropped. Nothing on
    // the card claims a cap, so an unknown one cannot put a false figure on
    // screen, and dropping the row would only empty the card on a thin feed.
    marketCap: Number.isFinite(token.marketCap) ? token.marketCap : 0,
    spot: {
      symbol,
      // The name is decorative; the symbol is the identity, so it stands in.
      name: token.name?.trim() || symbol,
      price: formatUsd(price),
      change,
      up,
      movePercent,
      logo: logo(token.logo),
      href: detailHref(symbol),
    },
  };
}

/**
 * One row per ticker, keeping the bigger listing of any duplicates.
 *
 * The feed carries a ticker once per coin id, so wrapped and bridged variants
 * can put the same ticker on the page twice. The ticker is the whole identity
 * of a card this size, so a rotation that deals the same one twice with two
 * different figures is the row arguing with itself. The row is ranked by cap,
 * so the listing kept is the one that earned the ranking.
 */
function oneRowPerSymbol(ranked: readonly RankedSpot[]): RankedSpot[] {
  const seen = new Map<string, RankedSpot>();
  for (const row of ranked) {
    const key = row.spot.symbol.toUpperCase();
    const held = seen.get(key);
    if (!held || row.marketCap > held.marketCap) seen.set(key, row);
  }
  return [...seen.values()];
}

/**
 * The top `limit` by cap, with a slot held for each named token the ranking
 * would otherwise have cut.
 *
 * A held token is given a place in the row, not a place at the front. It is
 * sorted back in on its own cap like everything else, so the row still reads
 * biggest first and says nothing about the token beyond that it is one the desk
 * trades. Nothing here relaxes an exclusion either: a named token reaches this
 * function only by clearing `rank`, so a delisted, priceless or no-move HYPE is
 * already gone and stays gone.
 *
 * Two limits keep the row honest:
 *
 * - Only a token nobody named may give up its slot, and the smallest one goes
 *   first. Without this the ranking's own tail is cut blind, which on the live
 *   feed means holding a slot for HYPE by cutting SOL: one named token evicting
 *   another, for a smaller one. When every slot is already named, the hold is
 *   simply not made.
 * - At most half the row, so the majority is always the cap ranking. The named
 *   list is a preference the desk gave us, not the contents of the card, and a
 *   card that could only ever show six tickers would stop being a market feed.
 */
function holdFeaturedSlots(ranked: readonly RankedSpot[], limit: number): RankedSpot[] {
  const top = ranked.slice(0, limit);
  if (ranked.length <= limit) return top;

  const evictable = top.filter((row) => !featured(row.spot.symbol)).length;
  const reservable = Math.min(Math.floor(limit / 2), evictable);
  if (reservable === 0) return top;

  const shown = new Set(top.map((row) => row.spot.symbol.toUpperCase()));
  const held: RankedSpot[] = [];
  // The tail is still in cap order, so the first match on a ticker is the
  // biggest listing carrying it.
  for (const row of ranked.slice(limit)) {
    const ticker = row.spot.symbol.toUpperCase();
    if (!FEATURED_SYMBOLS.has(ticker) || shown.has(ticker)) continue;
    shown.add(ticker);
    held.push(row);
    if (held.length === reservable) break;
  }
  if (held.length === 0) return top;

  // The smallest unnamed tokens give up their slots, and the row is ranked
  // again so it still reads biggest first.
  const kept = top.filter((row) => featured(row.spot.symbol));
  const unnamed = top.filter((row) => !featured(row.spot.symbol));
  const survivors = unnamed.slice(0, unnamed.length - held.length);
  return [...kept, ...survivors, ...held].sort((a, b) => b.marketCap - a.marketCap);
}

function sameSpots(a: readonly TokenSpot[], b: readonly TokenSpot[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((left, index) => {
    const right = b[index];
    return (
      left.symbol === right.symbol &&
      left.name === right.name &&
      left.price === right.price &&
      left.change === right.change &&
      left.up === right.up &&
      left.movePercent === right.movePercent &&
      left.logo === right.logo &&
      left.href === right.href
    );
  });
}

/**
 * The tokens the "Stay Ahead of Token Moves" card cycles through, biggest by
 * market cap first, and whether the feed is still loading.
 *
 * The card used to rank by the size of the 24h move, which is the wrong reading
 * of "popular": the biggest movers on any given day are the day's most volatile
 * micro caps, so the row filled with tickers nobody on the spot desk trades.
 * Market cap is the closer measure, it is a field the feed already carries, and
 * it needs no maintenance as the market reorders itself. It is also what the
 * upstream list is already sorted by, so this ranks explicitly rather than
 * leaning on an order the provider does not promise.
 *
 * Cap alone is not the whole rule. It carries BTC, ETH, BNB and SOL but stops
 * short of HYPE and APE, so those keep a reserved slot: see `FEATURED_SYMBOLS`
 * and `holdFeaturedSlots`. What it also carries, and must not, are the
 * stablecoins sitting third and sixth; `rank` drops those.
 *
 * The move is still what the card prints, and it is printed verbatim. Losers
 * are not filtered out and not reordered: a major that is down shows red, which
 * is why the shape carries `up` at all. Hiding a red market would blank the
 * card on exactly the days people check it.
 *
 * An empty array is a normal result. The feed has not loaded, the request
 * failed, or nothing in it cleared the exclusions: the card falls back to its
 * committed illustration.
 *
 * `loading` is passed through so the card can draw its skeleton rather than
 * dropping to the Eth Africa slide and back once the tokens land.
 *
 * The returned array keeps its identity for as long as its contents are equal,
 * so a background refetch does not restart the card's ten second rotation.
 */
export function useTokenSpots(limit: number = DEFAULT_LIMIT): {
  tokens: readonly TokenSpot[];
  loading: boolean;
} {
  const { data, isLoading } = useMarketTokens(POPULAR);

  const spots = useMemo(() => {
    if (limit <= 0) return NO_SPOTS;
    const ranked = (data ?? []).map(rank).filter((row): row is RankedSpot => row !== null);
    if (ranked.length === 0) return NO_SPOTS;
    // Sort is stable, so tokens on the same cap, including the rows the feed
    // gave no cap at all, hold their upstream order.
    const rows = oneRowPerSymbol(ranked).sort((a, b) => b.marketCap - a.marketCap);
    return holdFeaturedSlots(rows, limit).map((row) => row.spot);
  }, [data, limit]);

  // A refetch hands back a fresh array whether or not anything moved, and a
  // fresh array is a fresh set of cards as far as the card is concerned, which
  // would restart the ten second rotation mid-cycle. So the last result is kept
  // and returned again while the new one matches it field for field. This is
  // React's own adjust-state-during-render pattern: the set below re-renders
  // immediately, before anything is painted, and only when the tokens really
  // changed.
  const [held, setHeld] = useState(spots);
  let shown = held;
  if (!sameSpots(held, spots)) {
    setHeld(spots);
    shown = spots;
  }

  return { tokens: shown, loading: isLoading };
}
