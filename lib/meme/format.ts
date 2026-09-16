import { fromBaseUnits } from "@/lib/trade/math";

// Display helpers for the trade service's decimal strings. The contract's
// rule, applied here once: null means "not currently available". It is never
// coerced to zero, and a real zero is never hidden as if it were missing.

export type ChangeDirection = "up" | "down";

/**
 * The direction of a signed percentage-point change, or null when the service
 * published none. A null change draws neutral: never green, never red.
 */
export function changeDirection(value: string | null | undefined): ChangeDirection | null {
  if (value === null || value === undefined || value.trim() === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return n >= 0 ? "up" : "down";
}

/** A chart's `up` flag for a change: null, drawn neutral, when none was published. */
export function chartUp(value: string | null | undefined): boolean | null {
  const direction = changeDirection(value);
  return direction === null ? null : direction === "up";
}

/** Compact USD for market stats ("$1.2M"); a real "0" is "$0", only a missing figure is "—". */
export function compactUsd(value: string | null): string {
  if (value === null || value.trim() === "") return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  const shown = Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(Math.abs(n));
  return `${n < 0 ? "-" : ""}$${shown}`;
}

// Every platform fee settles in USDC, on Base and on Solana alike (the
// contract's "Platform fees"). The preview names the fee's amount but not its
// token, so the symbol is the contract's rule stated once here, not a guess
// made per surface. The rate is never stated anywhere: the fee shown is always
// the one the preview or quote returned.
export const PLATFORM_FEE_SYMBOL = "USDC";
const USDC_DECIMALS = 6;
const BASE_UNITS = /^\d+$/;

/**
 * A USDC amount in base units ("2500") as a decimal string ("0.0025"), through
 * a bigint so no base unit is lost however long the figure runs. Null for
 * anything that is not a whole number of base units: an unreadable fee is not
 * shown rather than shown wrong.
 */
/** The fee as a ticket shows it: the service's own figure, in USDC. */
export function platformFeeText(formatted: string): string {
  return `${formatted} ${PLATFORM_FEE_SYMBOL}`;
}

export function formatUsdcAtomic(atomic: string): string | null {
  const cleaned = atomic.trim();
  if (!BASE_UNITS.test(cleaned)) return null;
  return fromBaseUnits(BigInt(cleaned), USDC_DECIMALS);
}

// A position's mark is labelled stale once it is older than this. The
// contract asks for marketDataUpdatedAt to be shown or used to label stale
// prices, without naming a threshold; fifteen minutes is this app's, stated
// once here (ADR-2026-09-14-memecoins-trade-contract, slice 5).
export const MARKET_DATA_STALE_MS = 15 * 60_000;

export type MarketDataAge =
  { kind: "none" } | { kind: "fresh"; minutes: number } | { kind: "stale"; minutes: number };

/**
 * How old a position's market data is at `now`: "none" when the service has
 * no timestamp (or an unreadable one), otherwise its whole-minute age, stale
 * past MARKET_DATA_STALE_MS.
 */
export function marketDataAge(updatedAt: string | null, now: number): MarketDataAge {
  if (updatedAt === null) return { kind: "none" };
  const at = Date.parse(updatedAt);
  if (Number.isNaN(at)) return { kind: "none" };
  const age = Math.max(0, now - at);
  const minutes = Math.floor(age / 60_000);
  return age > MARKET_DATA_STALE_MS ? { kind: "stale", minutes } : { kind: "fresh", minutes };
}
