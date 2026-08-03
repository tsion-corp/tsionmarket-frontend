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
