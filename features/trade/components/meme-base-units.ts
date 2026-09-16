import { fromBaseUnits } from "@/lib/trade/math";

// Reading and printing on-chain base units for the memecoin screens.
//
// Both halves stay on strings and bigint. A memecoin holding routinely runs
// past 2^53 base units, so a float anywhere on this path silently drops real
// digits from a balance.

const BASE_UNITS = /^\d+$/;

// A base-unit string is an integer. Anything else is an upstream defect, and
// nothing here guesses at a figure it cannot read.
export function parseBaseUnits(raw: string): bigint | null {
  const cleaned = raw.trim();
  return BASE_UNITS.test(cleaned) ? BigInt(cleaned) : null;
}

// Display edge, and only the display edge: group the whole part and clamp the
// fraction, on strings, so a balance never routes through a float. A memecoin
// holding routinely runs past 2^53 base units.
export function groupBaseUnits(raw: bigint, decimals: number): string {
  const [whole = "0", frac = ""] = fromBaseUnits(raw, decimals).split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const shown = frac.slice(0, 4).replace(/0+$/, "");
  return shown ? `${grouped}.${shown}` : grouped;
}
