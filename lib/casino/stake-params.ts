// The chess flow (create, matchmaking, invite, play) hands the chosen stake
// around through query params. These parsers keep every page reading the same
// defaults instead of each one improvising.

import { TIME_CONTROLS, type TimeControl } from "@/lib/casino/demo";
import type { CasinoCurrency } from "@/lib/casino/stakes";

// ₦25,000 stake, so a fresh play screen shows the design's ₦50,000 pot.
export const DEFAULT_STAKE_MINOR = 2_500_000;
export const DEFAULT_CURRENCY: CasinoCurrency = "NGN";
export const DEFAULT_TIME_CONTROL: TimeControl = "5+3";

export function parseStakeMinorParam(value: string | null): number {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_STAKE_MINOR;
}

export function parseCurrencyParam(value: string | null): CasinoCurrency {
  return value === "NGN" || value === "USDC" || value === "SOL" ? value : DEFAULT_CURRENCY;
}

export function parseTimeControlParam(value: string | null): TimeControl {
  return (TIME_CONTROLS as readonly string[]).includes(value ?? "")
    ? (value as TimeControl)
    : DEFAULT_TIME_CONTROL;
}

export function stakeQuery(
  stakeMinor: number,
  currency: CasinoCurrency,
  timeControl: TimeControl
): string {
  const params = new URLSearchParams({
    stake: String(stakeMinor),
    cur: currency,
    tc: timeControl,
  });
  return params.toString();
}
