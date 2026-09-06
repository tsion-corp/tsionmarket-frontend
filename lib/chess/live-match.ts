// The rule for whether a chess match the service calls "active" is really
// still being played. Shared by the arcade lobby in the browser and the
// dashboard feed on the server, which is why it sits below the feature line.

// A match marked `active` cannot legitimately outlive its total available
// clock budget: both starting banks plus every increment that could have been
// awarded across the moves already played. If it does, the backend left it
// "live" after it should have timed out, so the lobby hides it.
export const STALE_ACTIVE_MATCH_GRACE_MS = 30 * 1000;

export interface LiveMatchClock {
  createdAt: string;
  startedAt: string | null;
  timeControl: { initialSeconds: number; incrementSeconds: number };
  ply: number;
}

export function isPlausiblyActiveMatch(wire: LiveMatchClock, now = Date.now()): boolean {
  const started = Date.parse(wire.startedAt ?? wire.createdAt);
  if (!Number.isFinite(started)) return true;

  const initial = wire.timeControl.initialSeconds;
  const increment = wire.timeControl.incrementSeconds;
  const ply = Math.max(0, wire.ply);
  if (!Number.isFinite(initial) || !Number.isFinite(increment)) return true;

  const maxLiveAgeMs = (initial * 2 + increment * ply) * 1000 + STALE_ACTIVE_MATCH_GRACE_MS;
  return now - started <= maxLiveAgeMs;
}
