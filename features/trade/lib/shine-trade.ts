// The facts a confirmed swap can hand to Shine, taken from the quote it
// executed against.
//
// A price is the only figure a Shine post may carry from a trade
// (ADR-2026-09-24 section 5), and lib/shine/money offers no constructor for an
// amount, a size or a balance. Nothing here produces one either: the two
// atomic legs of the swap are divided into a price per whole unit and handed
// straight to entryPriceFromBaseUnits, which is the only way a figure from
// this file can reach a post.
//
// Every step is bigint. A memecoin price of 0.00000420000000000001 loses its
// last digits to a double, and with no deep link a post cannot be corrected
// after it is written, so the price is the part that has to stay true forever.

import type { PreparedSwap } from "@/lib/meme/api";
import { entryPriceFromBaseUnits, pnlPercentFromBaseUnits, type EntryPrice } from "@/lib/shine";
import type { PnlPercent } from "@/lib/shine";
import type { HlClosedPositionView } from "@/features/trade/lib/hyperliquid-types";
import { toBaseUnits } from "@/lib/trade/math";

/**
 * Places the quotient is carried to before it is rendered.
 *
 * Eighteen, not the token's own decimals: the division below truncates, and a
 * memecoin priced at 0.0000042 needs every one of those places to survive it.
 * formatUsdString then cuts it back to four significant digits.
 */
const PRICE_DECIMALS = 18;

/** The ceiling entryPriceFromBaseUnits itself enforces. */
const MAX_DECIMALS = 36;

const ATOMIC = /^\d+$/;

function atomic(value: string | null | undefined): bigint | null {
  if (typeof value !== "string" || !ATOMIC.test(value.trim())) return null;
  return BigInt(value.trim());
}

function places(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isInteger(value)) return null;
  if (value < 0 || value > MAX_DECIMALS) return null;
  return value;
}

/**
 * USD per whole unit of the token, from the USDC leg and the token leg of one
 * swap. Null when either leg is missing, unreadable or zero.
 *
 * Null rather than a guess, exactly as lib/shine/money does it: a post that
 * omits the price still says something true, and a post that states the wrong
 * one cannot be taken back.
 */
export function swapUnitPrice(
  usdcAtomic: string | null | undefined,
  usdcDecimals: number | null | undefined,
  tokenAtomic: string | null | undefined,
  tokenDecimals: number | null | undefined
): EntryPrice | null {
  const usdc = atomic(usdcAtomic);
  const token = atomic(tokenAtomic);
  const usdcPlaces = places(usdcDecimals);
  const tokenPlaces = places(tokenDecimals);
  if (usdc === null || token === null || usdcPlaces === null || tokenPlaces === null) return null;
  if (token === 0n) return null;
  // (usdc / 10^usdcPlaces) / (token / 10^tokenPlaces), held at PRICE_DECIMALS.
  const raw =
    (usdc * 10n ** BigInt(PRICE_DECIMALS + tokenPlaces)) / (token * 10n ** BigInt(usdcPlaces));
  return entryPriceFromBaseUnits(raw, PRICE_DECIMALS);
}

export interface SwapShineFacts {
  /** The traded token's ticker, or null when the quote names none. */
  symbol: string | null;
  /** What one unit of it changed hands at, or null. */
  price: EntryPrice | null;
}

/**
 * What a confirmed EVM swap can say about itself.
 *
 * A BUY spends the sell leg (USDC) on the buy leg; a SELL does the reverse.
 * The traded token is the non-USDC leg either way, and the USDC leg prices it.
 *
 * The buy side is the quote's EXPECTED amount, which is what the trade was
 * placed against and what the user acted on — the entry, in the ADR's words.
 * The executed amount is bounded by the quote's own slippage tolerance, and
 * the swap receipt that would prove it is not available on every path (a
 * sponsored operation with no receipt registers a user-operation hash and has
 * no logs to read), so taking it only sometimes would make the price mean two
 * different things in the same feed.
 */
export function swapShineFacts(quote: PreparedSwap): SwapShineFacts {
  const buying = quote.side === "BUY";
  const traded = buying ? quote.buyToken : quote.sellToken;
  const usdc = buying ? quote.sellToken : quote.buyToken;
  const tradedAtomic = buying ? quote.expectedBuyAmountAtomic : quote.sellAmountAtomic;
  const usdcAtomic = buying ? quote.sellAmountAtomic : quote.expectedBuyAmountAtomic;
  return {
    symbol: traded.symbol,
    price: swapUnitPrice(usdcAtomic, usdc.decimals, tradedAtomic, traded.decimals),
  };
}

// ── A closed perps position ────────────────────────────────────────────────

/**
 * How recently a polled outcome must have settled to be worth posting.
 *
 * The dedup store stops the SECOND post of something. It does nothing about
 * the first, and on the day Shine ships every store is empty while the app is
 * full of settled state. Anything read from a poll rather than from a handler
 * can therefore serve a backlog the first time it runs, and a Shine post
 * carries no date, so the square stamps a trade from last month as happening
 * now.
 *
 * Twenty-four hours, and the asymmetry is the whole argument: a post missed
 * because nobody opened the page can still be written by hand, and a post
 * that says the wrong thing cannot be retracted.
 */
export const SHINE_MAX_SETTLEMENT_AGE_MS = 24 * 60 * 60 * 1000;

/** Whether an ISO settlement time is recent enough to post about. */
export function settledRecently(closedAt: string | null | undefined, now = Date.now()): boolean {
  if (typeof closedAt !== "string") return false;
  const at = Date.parse(closedAt);
  if (Number.isNaN(at)) return false;
  // A record stamped in the future is a clock disagreement, not a fresh
  // close, and is treated as unusable rather than as maximally fresh.
  return at <= now && now - at <= SHINE_MAX_SETTLEMENT_AGE_MS;
}

/** The scale the margin arithmetic below runs at. Wide enough for any market. */
const ROI_SCALE = 18;

/** A signed decimal string as base units at `ROI_SCALE`, or null if unreadable. */
function signedScaled(value: string | null | undefined): bigint | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  const negative = trimmed.startsWith("-");
  const magnitude = negative ? trimmed.slice(1) : trimmed;
  // toBaseUnits answers 0n for anything it cannot read, so the shape is
  // checked here rather than inferred from a zero.
  if (!/^\d+(?:\.\d+)?$/.test(magnitude)) return null;
  const raw = toBaseUnits(magnitude, ROI_SCALE);
  return negative ? -raw : raw;
}

/**
 * The return on a closed position, as the percentage this app already means
 * by it: the realised PnL against the margin actually committed
 * (notional / leverage). features/trade/lib/pnl-card.ts computes the share
 * card's figure the same way, and the two must agree — a post and a card for
 * the same trade disagreeing is worse than either of them alone.
 *
 * The arithmetic is bigint the whole way, unlike the card's, because a card is
 * redrawn from the record on demand and a post is permanent. pnlPercentFrom-
 * BaseUnits takes an entry and an exit in the same units, so the margin is the
 * entry and the margin plus the realised PnL is the exit.
 *
 * Null wherever the figure cannot be computed exactly. A return of "0%" is a
 * claim about the trade; "no return stated" is not.
 */
export function closedPositionRoi(position: HlClosedPositionView): PnlPercent | null {
  const entry = signedScaled(position.entryPrice);
  const size = signedScaled(position.size);
  const pnl = signedScaled(position.realizedPnlUsdc);
  if (entry === null || size === null || pnl === null) return null;
  if (entry <= 0n || size <= 0n) return null;
  if (!Number.isInteger(position.leverage) || position.leverage <= 0) return null;

  const unit = 10n ** BigInt(ROI_SCALE);
  const notional = (entry * size) / unit;
  const margin = notional / BigInt(position.leverage);
  if (margin <= 0n) return null;
  return pnlPercentFromBaseUnits(margin, margin + pnl);
}
