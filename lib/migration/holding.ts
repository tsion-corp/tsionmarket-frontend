// Small helpers shared by every venue adapter.

import type { Venue } from "@/lib/migration/types";

export function holdingId(venue: Venue, kind: string, ref: string): string {
  return `${venue}:${kind}:${ref}`;
}

// Display value of an exact base-unit amount at a per-unit USD price. Display
// only; never feeds an on-chain amount.
export function usdValue(amount: bigint, decimals: number, priceUsd: number): number {
  return (Number(amount) / 10 ** decimals) * priceUsd;
}

// Parses a decimal string the gateway reports (e.g. "12.5" USDC) into base
// units without going through floating point.
export function decimalToBaseUnits(value: string, decimals: number): bigint {
  const trimmed = value.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return 0n;
  const [whole, fraction = ""] = trimmed.split(".");
  const padded = (fraction + "0".repeat(decimals)).slice(0, decimals);
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(padded || "0");
}
