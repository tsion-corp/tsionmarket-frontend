export const DECIMAL_CLOCK_SECONDS = 60;

export function formatChessClock(totalSeconds: number): string {
  const safe = Math.max(0, totalSeconds);
  if (safe < DECIMAL_CLOCK_SECONDS) {
    const tenths = Math.min(59.9, Math.ceil(safe * 10) / 10);
    return `0:${tenths.toFixed(1).padStart(4, "0")}`;
  }

  const whole = Math.floor(safe);
  return `${String(Math.floor(whole / 60)).padStart(2, "0")}:${String(whole % 60).padStart(2, "0")}`;
}

export function lowChessClockClass(seconds: number, live: boolean): string {
  if (!live || seconds > DECIMAL_CLOCK_SECONDS) return "";
  return seconds <= 10
    ? "border border-[#ff5b57]/70 text-[#ff5b57] animate-pulse"
    : "text-[#ff625e]";
}
