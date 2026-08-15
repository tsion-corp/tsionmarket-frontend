import type { LotterySelection } from "@/features/casino/lib/api/lottery";

export const WHITE_BALL_COUNT = 5;
export const WHITE_BALL_MAX = 69;
export const POWER_BALL_MAX = 26;
export const LOTTERY_TIME_ZONE = "UTC";

export function toggleWhiteBall(selected: readonly number[], number: number): number[] {
  if (!Number.isInteger(number) || number < 1 || number > WHITE_BALL_MAX) return [...selected];
  if (selected.includes(number)) return selected.filter((value) => value !== number);
  if (selected.length >= WHITE_BALL_COUNT) return [...selected];
  return [...selected, number].sort((a, b) => a - b);
}

export function completeLotterySelection(
  whiteNumbers: readonly number[],
  powerNumber: number | null
): LotterySelection | null {
  const unique = [...new Set(whiteNumbers)].sort((a, b) => a - b);
  if (
    unique.length !== WHITE_BALL_COUNT ||
    unique.some((number) => !Number.isInteger(number) || number < 1 || number > WHITE_BALL_MAX) ||
    powerNumber === null ||
    !Number.isInteger(powerNumber) ||
    powerNumber < 1 ||
    powerNumber > POWER_BALL_MAX
  ) {
    return null;
  }
  return { whiteNumbers: unique, powerNumber };
}

export function lotterySelectionKey(selection: LotterySelection): string {
  return `${[...selection.whiteNumbers].sort((a, b) => a - b).join("-")}:${selection.powerNumber}`;
}

export function millisecondsUntil(timestamp: string, now = Date.now()): number {
  const target = Date.parse(timestamp);
  return Number.isFinite(target) ? Math.max(0, target - now) : 0;
}

export interface LotteryCountdown {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

export function lotteryCountdown(timestamp: string, now = Date.now()): LotteryCountdown {
  let remaining = Math.floor(millisecondsUntil(timestamp, now) / 1_000);
  const days = Math.floor(remaining / 86_400);
  remaining -= days * 86_400;
  const hours = Math.floor(remaining / 3_600);
  remaining -= hours * 3_600;
  const minutes = Math.floor(remaining / 60);
  const seconds = remaining - minutes * 60;
  return { days, hours, minutes, seconds };
}

export function lotterySalesOpen(status: string, salesCloseAt: string, now = Date.now()): boolean {
  return status === "open" && millisecondsUntil(salesCloseAt, now) > 0;
}

export function formatLotteryUsdc(value: string, fractionDigits = 2): string {
  const match = /^(\d+)(?:\.(\d+))?$/u.exec(value.trim());
  if (!match) return value;
  const integer = (match[1] ?? "0").replace(/^0+(?=\d)/u, "");
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/gu, ",");
  const fraction = (match[2] ?? "").slice(0, fractionDigits).replace(/0+$/u, "");
  return fraction ? `${grouped}.${fraction}` : grouped;
}
