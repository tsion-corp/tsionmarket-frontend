// What the memecoin search box searches.
//
// Pure, and deliberately in lib rather than beside the input component: a hook
// (use-meme-tokens) needs this matcher, and a hook importing a component module
// points the wrong way against the layering rule in AGENTS.md. Nothing here
// touches React or the DOM, so it belongs next to lib/meme/screener.ts.
//
// Money and figures are compared as digit strings, never parsed into a float,
// because these are the service's decimal strings and a double loses them.

import { SOLANA_CHAIN_ID, chainSlug } from "@/lib/meme/chain";
import { exactDecimal } from "@/lib/meme/momentum";
import { ageMinutes } from "@/lib/meme/screener";
import type { MemeToken } from "@/lib/meme/types";

// ---------------------------------------------------------------------------
// What the box searches
// ---------------------------------------------------------------------------
//
// The name is not what a reader has in hand. They have a contract address from
// a group chat, a market cap off a chart, a launch time, a price. So the query
// is matched against the whole row, not just its label.
//
// The catalogue behind the box is every token the service returns, and the
// matcher runs over all of it on every keystroke, so the split below matters:
// the query is read once, in `memeSearchTerms`, and the per-row work is a
// handful of `includes` calls and, only for a query that reads as a figure, a
// regex and two string slices per field. No parsing, no allocation of a
// formatter, and no bigint on the common path.

/** A figure as the matcher compares it, taken apart without a float. */
interface FigureShape {
  /** Significant digits, leading zeros removed. "0" for a figure of zero. */
  digits: string;
  /**
   * How many digits sit before the point. Zero or below for a figure under
   * one, counting the zeros that follow the point: 0.0001 is -3.
   */
  place: number;
}

type AgeUnit = "minutes" | "hours" | "days";

interface AgeTerm {
  unit: AgeUnit;
  count: number;
}

export interface MemeSearchTerms {
  /** The query as typed, trimmed. A Solana mint is case sensitive. */
  text: string;
  /** The same, lower-cased, for the fields where case carries no meaning. */
  lower: string;
  /** Set when the query reads as a figure: "1.5m", "$500k", "0.0001". */
  figure: FigureShape | null;
  /** Set when the query reads as an age: "3d", "12h", "45min". */
  age: AgeTerm | null;
}

const SUFFIX_EXPONENT: Record<string, number> = { k: 3, m: 6, b: 9, t: 12 };

// "m" is a million here, not a minute, because a market cap is typed far more
// often than an age. Minutes are spelled "min" for that reason.
const AGE_QUERY = /^(\d+)\s*(min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days)$/i;
const AGE_UNIT_MINUTES: Record<AgeUnit, number> = { minutes: 1, hours: 60, days: 1440 };

const FIGURE_QUERY = /^(\d*)(?:\.(\d+))?([kmbt])?$/i;
const PLAIN_DECIMAL = /^[+-]?(\d*)(?:\.(\d+))?$/;

/** Whole and fractional digits as a shape, with no number ever constructed. */
function shapeOf(whole: string, fraction: string): FigureShape {
  const all = whole + fraction;
  let lead = 0;
  while (lead < all.length - 1 && all[lead] === "0") lead += 1;
  return { digits: all.slice(lead), place: whole.length - lead };
}

function trimTrailingZeros(digits: string): string {
  let end = digits.length;
  while (end > 1 && digits[end - 1] === "0") end -= 1;
  return digits.slice(0, end);
}

function figureTerm(query: string): FigureShape | null {
  const cleaned = query.replace(/[$,%\s]/g, "");
  const match = FIGURE_QUERY.exec(cleaned);
  if (match === null) return null;
  const [, whole = "", fraction = "", suffix] = match;
  if (whole === "" && fraction === "") return null;
  const shape = shapeOf(whole === "" ? "0" : whole, fraction);
  const exponent = suffix === undefined ? 0 : SUFFIX_EXPONENT[suffix.toLowerCase()];
  // A reader typing "500k" means the coins around half a million, not the
  // thousand dollars between 500,000 and 500,999, so the zeros they typed
  // widen the band rather than narrowing it.
  return { digits: trimTrailingZeros(shape.digits), place: shape.place + exponent };
}

function ageTerm(query: string): AgeTerm | null {
  const match = AGE_QUERY.exec(query);
  if (match === null) return null;
  const count = Number(match[1]);
  if (!Number.isSafeInteger(count)) return null;
  const written = match[2].toLowerCase();
  const unit: AgeUnit = written.startsWith("d")
    ? "days"
    : written.startsWith("h")
      ? "hours"
      : "minutes";
  return { unit, count };
}

/**
 * The query taken apart once, ready for the row loop. Null for a query with
 * nothing in it, which means "no search" rather than "nothing matches".
 *
 * Hold the result across renders (a `useMemo` on the raw query): the point of
 * it is that the row loop reads it instead of re-reading the query.
 */
export function memeSearchTerms(raw: string): MemeSearchTerms | null {
  const text = raw.trim();
  if (text === "") return null;
  return { text, lower: text.toLowerCase(), figure: figureTerm(text), age: ageTerm(text) };
}

/** A token's own figure as a shape, or null when the service published none. */
function valueShape(value: string | null | undefined): FigureShape | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  const plain = PLAIN_DECIMAL.exec(trimmed);
  if (plain !== null) {
    const [, whole = "", fraction = ""] = plain;
    if (whole === "" && fraction === "") return null;
    return shapeOf(whole === "" ? "0" : whole, fraction);
  }
  // A very small price arrives in exponent form ("1.21495281918e-9"), so that
  // one goes through the exact reader rather than being skipped.
  const exact = exactDecimal(trimmed);
  if (exact === null) return null;
  const digits = (exact.units < 0n ? -exact.units : exact.units).toString();
  return { digits, place: digits.length - exact.scale };
}

/**
 * Whether a figure the service published answers the query: same magnitude,
 * and its digits start with the ones typed. "1.5m" finds a $1.53M cap and not
 * a $1.88M one; "0.0001" finds a price of 0.00012345.
 */
function figureMatches(value: string | null | undefined, term: FigureShape): boolean {
  const shape = valueShape(value);
  return shape !== null && shape.place === term.place && shape.digits.startsWith(term.digits);
}

// Case matters on Solana, where a base58 mint in another case is another
// address, and does not on Base, where an address is hex. Same rule as
// lib/meme/chain's isQuoteCurrency, stated the same way.
function addressMatches(address: string, chainId: number, terms: MemeSearchTerms): boolean {
  return chainId === SOLANA_CHAIN_ID
    ? address.includes(terms.text)
    : address.toLowerCase().includes(terms.lower);
}

function ageMatches(token: MemeToken, term: AgeTerm, now: number): boolean {
  const minutes = ageMinutes(token.pairCreatedAt, now);
  if (minutes === null) return false;
  return Math.floor(minutes / AGE_UNIT_MINUTES[term.unit]) === term.count;
}

/**
 * Whether a row answers the query: its symbol, name, contract or pair address,
 * venue, chain, age, or any of its published figures.
 *
 * The order is what each test costs and how often it answers. The symbol and
 * the name settle nearly every query, so the figure work only runs for the
 * rows they did not.
 */
export function memeSearchMatches(token: MemeToken, terms: MemeSearchTerms, now: number): boolean {
  if (token.symbol !== null && token.symbol.toLowerCase().includes(terms.lower)) return true;
  if (token.name !== null && token.name.toLowerCase().includes(terms.lower)) return true;
  if (addressMatches(token.address, token.chainId, terms)) return true;
  if (token.pairAddress !== null && addressMatches(token.pairAddress, token.chainId, terms)) {
    return true;
  }
  if (token.dexName !== null && token.dexName.toLowerCase().includes(terms.lower)) return true;
  if (chainSlug(token.chainId)?.startsWith(terms.lower) === true) return true;
  if (terms.age !== null && ageMatches(token, terms.age, now)) return true;
  if (terms.figure === null) return false;
  const figure = terms.figure;
  return (
    figureMatches(token.priceUsd, figure) ||
    figureMatches(token.marketCapUsd, figure) ||
    figureMatches(token.liquidityUsd, figure) ||
    figureMatches(token.volume24hUsd, figure) ||
    figureMatches(token.fdvUsd, figure)
  );
}

/**
 * The rows a query leaves. An empty query filters nothing, so the list is
 * handed straight back rather than copied.
 */
export function filterMemeTokens(
  tokens: MemeToken[],
  terms: MemeSearchTerms | null,
  now: number
): MemeToken[] {
  if (terms === null) return tokens;
  return tokens.filter((token) => memeSearchMatches(token, terms, now));
}
