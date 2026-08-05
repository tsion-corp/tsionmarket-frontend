// Display helpers for the prediction market. These convert the bigint money
// model into numbers/strings for rendering only. Floats appear here, at the leaf,
// never on the money path (quotes, guards, and calldata stay bigint).

import { PRICE_SCALE, USDC_DECIMALS, type Side } from "@/lib/prediction/types";
import { fromBaseUnits } from "@/lib/trade/math";

// A 6-dec USDC/share amount as a display number.
export function toNumber(raw: bigint, decimals = USDC_DECIMALS): number {
  return Number(fromBaseUnits(raw, decimals));
}

// A 0..1e6 price as whole cents, e.g. 625123 -> "63¢".
export function priceToCents(price: bigint): string {
  const cents = Math.round((Number(price) / Number(PRICE_SCALE)) * 100);
  return `${cents}¢`;
}

// A 0..1e6 price as a percentage 0..100 for a progress bar.
export function priceToPct(price: bigint): number {
  return (Number(price) / Number(PRICE_SCALE)) * 100;
}

// A 0..1e6 price as a probability fraction 0..1, for the chart series.
export function priceToFraction(price: bigint): number {
  return Number(price) / Number(PRICE_SCALE);
}

// Compact USD for market stats, e.g. 1_200_000_000000n -> "$1.2M".
export function compactUsd(raw: bigint): string {
  const n = toNumber(raw);
  if (!Number.isFinite(n) || n <= 0) return "—";
  return `$${Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(n)}`;
}

export function sideLabel(side: Side): "Yes" | "No" {
  return side === "yes" ? "Yes" : "No";
}

// A wallet address shortened for display, e.g. 0x1234…aBcD.
export function shortAddress(address: string): string {
  if (!address || address.length < 10) return address || "—";
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

// Whether the prediction market data is served by a LOCAL backend (our own
// CPMM markets in dev) rather than the production/Polymarket source. Drives a
// "Local" badge so it's obvious which markets came from the local Docker service.
// True when the configured API URL points at localhost / a private LAN host.
export function isLocalPredictionSource(): boolean {
  const url = process.env.NEXT_PUBLIC_PREDICTION_API_URL ?? "";
  return /localhost|127\.0\.0\.1|0\.0\.0\.0|192\.168\.|10\.|:8085/.test(url);
}

// A unix-ms timestamp as a compact relative age, e.g. "3m", "2h", "5d".
export function timeAgo(ms: number, nowMs: number = Date.now()): string {
  const s = Math.max(0, Math.floor((nowMs - ms) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

// An AMM reserve for display. Never rounds a real balance down to "0".
//
// The pools were printed with toFixed(0), so a market trading at 3¢/97¢ (which
// holds ~0.19 NO shares against ~6 YES) showed "Pool NO 0" and read as though
// one side had no liquidity at all. The reserves were right; only the rounding
// was wrong, and on a money surface that is the difference between "thin" and
// "broken".
//
// Precision follows magnitude: whole numbers once a reserve is large enough for
// decimals to be noise, more places as it gets small, and a floor marker rather
// than a zero for genuine dust.
export function formatReserve(raw: bigint, decimals = USDC_DECIMALS): string {
  const n = toNumber(raw, decimals);
  if (!Number.isFinite(n) || n <= 0) return "0";
  if (n >= 1000) return n.toFixed(0);
  if (n >= 1) return n.toFixed(2);
  if (n >= 0.0001) return n.toFixed(4);
  return "<0.0001";
}

// How close a market is to closing, for the countdown's visual pressure. Pure
// and threshold-based so the UI never invents its own cutoffs:
//   imminent — inside the last 10 minutes, the window where a trade may not land
//   soon     — inside the last hour
//   none     — anything further out, or already closed (the caller shows a
//              status label rather than a countdown)
export type CloseUrgency = "none" | "soon" | "imminent";

const IMMINENT_SECONDS = 10 * 60;
const SOON_SECONDS = 60 * 60;

export function closeUrgency(
  closeSeconds: number | null | undefined,
  nowMs: number = Date.now()
): CloseUrgency {
  if (!closeSeconds || !Number.isFinite(closeSeconds)) return "none";
  const remainingS = closeSeconds - nowMs / 1000;
  if (remainingS <= 0) return "none";
  if (remainingS <= IMMINENT_SECONDS) return "imminent";
  if (remainingS <= SOON_SECONDS) return "soon";
  return "none";
}

// The exact moment a market stops trading, as a readable local date AND time.
// Date alone is not enough: a market can close hours from now, and "Aug 5" next
// to a nine-minute countdown tells the trader nothing about the deadline they
// are actually trading against. Returns "" for a missing or unparseable time so
// the caller can hide the row.
export function formatCloseDateTime(closeSeconds: number | null | undefined): string {
  if (!closeSeconds || !Number.isFinite(closeSeconds)) return "";
  const at = new Date(closeSeconds * 1000);
  if (Number.isNaN(at.getTime())) return "";
  return at.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// Below this the countdown carries seconds and the caller ticks every second.
// A day out, seconds are noise and a per-second re-render buys nothing.
export const COUNTDOWN_SECONDS_THRESHOLD = 86_400;

// A forward countdown to a close time, given both as unix SECONDS (the shape
// prediction close times are stored in). Returns null once the close time has
// passed (the caller shows "Closed" instead), so a market never shows a stale or
// negative countdown.
//
// Inside a day the seconds are always shown ("23h 35m 12s", "35m 12s", "12s"):
// a clock that visibly moves is what makes a closing market feel like one, and
// a static "23h 35m" reads as a label rather than a deadline. Past a day it
// falls back to the two most-significant units.
export function timeUntil(closeSeconds: number, nowMs: number = Date.now()): string | null {
  const remainingS = Math.floor(closeSeconds - nowMs / 1000);
  if (remainingS <= 0) return null;
  const d = Math.floor(remainingS / 86_400);
  const h = Math.floor((remainingS % 86_400) / 3_600);
  const m = Math.floor((remainingS % 3_600) / 60);
  const s = remainingS % 60;
  if (d > 0) return h > 0 ? `${d}d ${h}h` : `${d}d`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}
