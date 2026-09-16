"use client";

import { useMemo, useState } from "react";
import { useTrendingMemes } from "@/features/trade/hooks/use-meme-tokens";
import { visibleWarnings, type MemeToken, type TokenRiskLevel } from "@/lib/meme/api";
import type { MemeSpot } from "@/features/discovery/types";

// Adapter between the meme desk and the "Find the next 100X" card.
//
// Discovery may not import trade, so the route calls the trade slice's own
// trending hook and hands the card this display-ready shape. Every number is
// formatted here: the card renders strings and a colour flag, nothing else.

/**
 * Where every card in this row leads.
 *
 * There is no per-coin route. `/meme` selects a token in local state inside the
 * desk, so a query string would name a parameter nothing reads and the tap
 * would dead-end on an unselected desk. The desk is the honest destination
 * until a coin has a URL of its own.
 */
// On mobile the meme desk is a tab inside /market; /market?tab=memecoins opens
// it there and hands off to /meme from md up, so a card lands on the right
// surface either way rather than a route the phone does not have.
const MEME_DESK = "/market?tab=memecoins";

const DEFAULT_LIMIT = 5;

/**
 * The tickers the card has drawn artwork for.
 *
 * The design ships a bespoke Shiba illustration and a Pepe avatar, and the card
 * swaps its generic disc for one of them when a coin with that ticker comes
 * round. Ranked purely by 24h move those two almost never reach the top five,
 * so the artwork the card was built around would sit in `public/market` unseen.
 * `holdFeaturedSlots` reserves them a place in the selection instead.
 *
 * Matched on the upper-cased ticker because the catalogue returns both "PEPE"
 * and "Pepe" for the same coin. The spot keeps whatever casing it arrived with.
 */
const FEATURED_SYMBOLS: ReadonlySet<string> = new Set(["SHIB", "PEPE"]);

// One shared empty result. A load that has not resolved, has failed, or has
// nothing promotable in it hands the card the same array every render, so the
// rotation timer does not restart on an empty feed.
const NO_SPOTS: readonly MemeSpot[] = Object.freeze([]);

// The risk levels this card will promote. See `promotable` for why UNKNOWN is
// on the list.
const PROMOTABLE_RISK: ReadonlySet<TokenRiskLevel> = new Set<TokenRiskLevel>([
  "LOW",
  "MEDIUM",
  "UNKNOWN",
]);

// Above 100% the decimals are noise in a chip this small, and a four figure
// gain with two of them does not fit. Below it they are the difference between
// a real move and a flat day.
const BIG_MOVE_PERCENT = 100;

/**
 * The coin's 24h move as a number, or null when the catalogue has none.
 *
 * `Number("")` is 0 and `Number(null)` is 0, so both are checked before the
 * parse rather than after it. A blank field means "not known", not "flat".
 */
function parseChange(raw: string | null): number | null {
  if (raw === null || raw.trim() === "") return null;
  const percent = Number(raw);
  return Number.isFinite(percent) ? percent : null;
}

/**
 * The coin's logo, or null when it has none the card can draw.
 *
 * The card falls back to a ticker disc on null, which is the only thing that
 * keeps the artwork slot filled: better than half the rows on the catalogue
 * fallback path carry no logo at all. That fallback is reached on null and
 * nothing else, so a value that is a string but not a usable image would slip
 * past it and put a broken-image icon on the card instead. The upstream schema
 * types the field as a nullable string with no format attached, so both cases
 * below are normalised to null here rather than left for the card to discover:
 *
 * - An empty string. As an `img` src the browser resolves it against the
 *   current page and requests the dashboard's own HTML, which fails as an
 *   image without reliably firing `onError`, so the card would never learn to
 *   fall back.
 * - Anything that is not absolute http(s). The logo host is a third party CDN
 *   and an absolute URL is the only form that can resolve from our origin.
 */
function logo(raw: string | null): string | null {
  if (raw === null) return null;
  const url = raw.trim();
  return /^https?:\/\//i.test(url) ? url : null;
}

/**
 * The move as the card shows it, plus the flag it colours by.
 *
 * `up` follows the rounded figure rather than the raw one, so a coin at
 * -0.001% reads "+0.00%" in green instead of "-0.00%" in red.
 */
function formatChange(percent: number): { change: string; up: boolean } {
  const digits = Math.abs(percent) >= BIG_MOVE_PERCENT ? 0 : 2;
  const rounded = Number(percent.toFixed(digits));
  const up = rounded >= 0;
  return { change: `${up ? "+" : "-"}${Math.abs(rounded).toFixed(digits)}%`, up };
}

/**
 * Whether this card is willing to feature the coin.
 *
 * The card is a rotating showcase for a coin nobody asked to see, under a
 * heading that promises 100X, and its only exit is a buy. That is a stronger
 * claim than the desk makes: there a coin sits in a table beside its risk badge
 * and its warnings, and the user picked it. Here there is room for a symbol and
 * a big green number and nothing else. So the rule is that the card only
 * promotes what it can promote honestly:
 *
 * - `buyEnabled === false`: the service will not sell it, so the card would be
 *   sending people to a coin they cannot buy.
 * - HIGH or CRITICAL `riskLevel`: promoting a coin the service's own risk
 *   engine has flagged, with the flag stripped off, is us making the
 *   recommendation. It stays reachable at the desk, with its badge attached.
 * - Any warning left after `visibleWarnings`: if the card cannot show the
 *   caveat it does not show the coin. `visibleWarnings` first drops the
 *   upgradeable-proxy flag, which nearly every serious token carries.
 *
 * UNKNOWN risk is allowed, and that is a deliberate concession rather than an
 * oversight. `/tokens/trending` omits the risk block entirely and
 * `withRiskDefaults` fills it with UNKNOWN and no warnings, so excluding
 * UNKNOWN would empty this card on the normal path and leave the exclusions
 * biting only on the catalogue fallback. Allowing it keeps the card live while
 * still dropping every coin that is actually flagged.
 */
function promotable(token: MemeToken): boolean {
  if (!token.buyEnabled) return false;
  if (linkLike(token.symbol) || linkLike(token.name)) return false;
  if (!PROMOTABLE_RISK.has(token.riskLevel)) return false;
  return visibleWarnings(token.warnings).length === 0;
}

// A scheme, a path, or a bare domain. The trending feed is a pump feed, and
// listings named after a repository or a website come through it; a card
// that read one out would name a codebase as the coin and send people to it.
const LINK_LIKE = /https?:|www\.|\/|\.[a-z]{2,}(?:$|[\/?#])/i;

/** Whether the listing's text is a link rather than a name. */
function linkLike(text: string | null): boolean {
  return text !== null && LINK_LIKE.test(text.trim());
}

interface RankedSpot {
  spot: MemeSpot;
  percent: number;
}

function rank(token: MemeToken): RankedSpot | null {
  if (!promotable(token)) return null;

  // The symbol is the whole identity of a card this size, and a "?" chip is
  // not a showcase.
  const symbol = token.symbol?.trim() ?? "";
  if (symbol === "") return null;

  // A coin with no 24h figure is dropped rather than shown as a dash. The
  // number is the entire content of the card, and without one there is also no
  // basis for placing the coin in the ranking below.
  const percent = parseChange(token.priceChange24hPercent);
  if (percent === null) return null;

  const { change, up } = formatChange(percent);
  return {
    percent,
    spot: {
      symbol,
      // The name is decorative; the symbol is the identity, so it stands in.
      name: token.name?.trim() || symbol,
      change,
      up,
      image: logo(token.logoUrl),
      href: MEME_DESK,
      token,
    },
  };
}

/**
 * One row per ticker, keeping the best ranked of any duplicates.
 *
 * The catalogue lists a ticker once per contract, so a page of it can carry two
 * PEPEs or two SOLs on different addresses. The ticker is the whole identity of
 * a card this size, so a rotation that deals the same one twice with two
 * different figures is the row arguing with itself, and it would draw the
 * featured artwork twice over. Takes the input already ranked, so the row kept
 * is the better mover.
 */
function oneRowPerSymbol(ranked: readonly RankedSpot[]): RankedSpot[] {
  const seen = new Set<string>();
  return ranked.filter((row) => {
    const ticker = row.spot.symbol.toUpperCase();
    if (seen.has(ticker)) return false;
    seen.add(ticker);
    return true;
  });
}

/**
 * The top `limit` movers, with a slot held for each coin the card has artwork
 * for that would otherwise have been cut.
 *
 * A featured coin is given a place in the selection, not a place at the front.
 * It is then sorted back in on its own 24h move like everything else, so it
 * lands wherever its number puts it and the card shows that number verbatim,
 * red and negative if that is what the day was. Pinning it to the head would
 * present a flat coin as the best mover in the row, and under a heading that
 * promises 100X with a buy at the end of it, that is a claim we cannot make.
 * Holding it a slot only changes which coins are in the row, never what their
 * order says.
 *
 * Nothing here relaxes an exclusion. A featured coin reaches this function only
 * by clearing `rank`, so a SHIB that is `buyEnabled: false`, flagged HIGH or
 * CRITICAL, carrying a visible warning, or missing a ticker or a 24h figure is
 * already gone and stays gone. Artwork is a reason to show a coin, not a reason
 * to trust it.
 *
 * At most half the row may be held this way. The row has to stay, in the
 * majority, the movers it claims to be, and on a one or two card row the top
 * mover is most of what the card says.
 */
function holdFeaturedSlots(ranked: readonly RankedSpot[], limit: number): RankedSpot[] {
  const top = ranked.slice(0, limit);
  const reservable = Math.floor(limit / 2);
  if (reservable === 0 || ranked.length <= limit) return top;

  const shown = new Set(top.map((row) => row.spot.symbol.toUpperCase()));
  const held: RankedSpot[] = [];
  // The tail is still in rank order, so the first match on a ticker is the best
  // ranked coin carrying it.
  for (const row of ranked.slice(limit)) {
    const ticker = row.spot.symbol.toUpperCase();
    if (!FEATURED_SYMBOLS.has(ticker) || shown.has(ticker)) continue;
    shown.add(ticker);
    held.push(row);
    if (held.length === reservable) break;
  }
  if (held.length === 0) return top;

  // The weakest movers give up their slots, and the row is ranked again so it
  // still reads best move first.
  const kept = top.slice(0, limit - held.length);
  return [...kept, ...held].sort((a, b) => b.percent - a.percent);
}

// `token` is deliberately not compared: the poll refetches a fresh object
// every 30 seconds even when nothing the card shows has moved, and comparing
// it would restart the rotation on every poll, which is exactly what this
// check exists to prevent. The buy sheet requotes live before it trades, so a
// held token that is a poll or two behind the on-screen figures is not a
// correctness problem.
function sameSpot(a: MemeSpot, b: MemeSpot): boolean {
  return (
    a.symbol === b.symbol &&
    a.name === b.name &&
    a.change === b.change &&
    a.up === b.up &&
    a.image === b.image &&
    a.href === b.href
  );
}

function sameSpots(a: readonly MemeSpot[], b: readonly MemeSpot[]): boolean {
  return a.length === b.length && a.every((spot, i) => sameSpot(spot, b[i]));
}

/**
 * The memecoins the "Find the next 100X" card cycles through, best 24h gainer
 * first.
 *
 * Trending here means the biggest 24h move, ranked by us rather than taken in
 * upstream order. The upstream feed is ranked by its own notion of trend, and
 * when it is down `fetchTrendingTokens` falls back to a page of the catalogue,
 * which is not ranked at all. Neither ordering matches a heading that promises
 * 100X, so the gainers are put in front.
 *
 * Two coins never share a ticker in the result, and the coins the card has
 * artwork for are held a slot in it rather than being left to reach the top
 * five on their own, which they almost never do. Both are changes to which
 * coins are in the row. The order is still the 24h move and nothing else, so a
 * held coin sits where its own number puts it. See `holdFeaturedSlots`.
 *
 * A held slot cannot conjure a coin that is not in the feed. The trending
 * upstream is a live discovery feed of new listings, and on most days it
 * carries neither SHIB nor PEPE, so the card still has to have something to
 * show when its artwork never comes up.
 *
 * Losers are not filtered out, only pushed to the back. On a red day the card
 * shows the best moves there actually were, coloured honestly by `up`, which is
 * why the shape carries that flag at all. Hiding a red market would leave the
 * row blank on exactly the days people are looking at it.
 *
 * An empty array is a normal result. The feed has not loaded, both upstreams
 * failed, or nothing in the page cleared the exclusions: the card falls back to
 * its committed illustration.
 *
 * The returned array keeps its identity for as long as its contents are equal,
 * including across the 30 second poll, so the card's rotation timer restarts
 * only when the featured coins really change.
 */
export function useMemeSpots(limit: number = DEFAULT_LIMIT): readonly MemeSpot[] {
  const { tokens } = useTrendingMemes();

  const spots = useMemo(() => {
    if (limit <= 0) return NO_SPOTS;
    const ranked = tokens.map(rank).filter((row): row is RankedSpot => row !== null);
    if (ranked.length === 0) return NO_SPOTS;
    // Sort is stable, so coins on the same move hold their upstream order.
    ranked.sort((a, b) => b.percent - a.percent);
    return holdFeaturedSlots(oneRowPerSymbol(ranked), limit).map((row) => row.spot);
  }, [tokens, limit]);

  // The 30 second poll hands back a fresh array whether or not anything moved,
  // and a fresh array is a fresh set of cards as far as the card is concerned.
  // So the last result is kept and returned again while the new one matches it
  // field for field, and only a real change is passed on. This is React's own
  // adjust-state-during-render pattern: the set below re-renders immediately,
  // before anything is painted, and it only runs when the coins really changed.
  const [held, setHeld] = useState(spots);
  let shown = held;
  if (!sameSpots(held, spots)) {
    setHeld(spots);
    shown = spots;
  }
  return shown;
}
