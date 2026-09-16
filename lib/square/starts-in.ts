/**
 * How far off a scheduled room is, for the chip on its card.
 *
 * The largest whole unit and nothing finer: "in 2 days", "in 5 hours",
 * "in 20 minutes". A card is glanced at, not watched, so a countdown would
 * only ever be wrong. A room whose time has come reads as now rather than as
 * a negative number.
 *
 * Pure so it can be pinned without a renderer; the caller supplies `now`.
 */
export interface StartsIn {
  unit: "day" | "hour" | "minute" | "now";
  count: number;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function startsIn(iso: string, now: number = Date.now()): StartsIn | null {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return null;
  const ahead = then - now;
  if (ahead < MINUTE) return { unit: "now", count: 0 };
  if (ahead >= DAY) return { unit: "day", count: Math.floor(ahead / DAY) };
  if (ahead >= HOUR) return { unit: "hour", count: Math.floor(ahead / HOUR) };
  return { unit: "minute", count: Math.floor(ahead / MINUTE) };
}
