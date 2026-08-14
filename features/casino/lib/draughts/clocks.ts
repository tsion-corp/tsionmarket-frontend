export const DRAUGHTS_MINUTE_OPTIONS = [1, 3, 5, 10, 15] as const;

export type DraughtsMinuteChoice = (typeof DRAUGHTS_MINUTE_OPTIONS)[number] | "custom";

export function resolveDraughtsMinutes(
  choice: DraughtsMinuteChoice,
  customMinutes: string
): number | null {
  if (choice !== "custom") return choice;
  if (!/^\d{1,3}$/u.test(customMinutes)) return null;
  const minutes = Number(customMinutes);
  return Number.isInteger(minutes) && minutes >= 1 && minutes <= 180 ? minutes : null;
}

export function draughtsTimeControl(
  choice: DraughtsMinuteChoice,
  customMinutes: string
): string | null {
  const minutes = resolveDraughtsMinutes(choice, customMinutes);
  return minutes === null ? null : `${minutes}+0`;
}
