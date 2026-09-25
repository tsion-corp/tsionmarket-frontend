import { pollUnlessFailing } from "@/lib/query-poll";

// As much of a React Query query as a `refetchInterval` callback reads.
type PolledQuery = { state: { status: string } };

// How much further apart a failing memecoin read is spaced than a healthy one.
// Two, so a service that has stopped answering is asked half as often and one
// that comes back is still noticed within a single healthy interval of doing so.
const FAILING_FACTOR = 2;

/**
 * `refetchInterval` for a memecoin read: the healthy cadence while the trade
 * service answers, a slower one while it does not.
 *
 * The app-wide rule is `pollUnlessFailing` in lib/query-poll, which drops a
 * failing query to a fixed sixty seconds. That backs off a fifteen second feed.
 * For the ten minute trending read it would be a tenfold speed-up, and ten
 * minutes is precisely the cadence the memecoin polls were slowed to after the
 * gateway's rate limiter read them as an attack and took the service down
 * (ADR-2026-09-15-meme-trending-screener). Backing off must never mean asking
 * more often, so the shared cadence is used as a floor rather than as the
 * answer, and a read that is already slower than the floor is slowed further
 * instead of being left alone.
 *
 * The shared helper still decides the healthy case and supplies the floor, so
 * the two rules cannot drift apart.
 */
export function memePollUnlessFailing(healthyMs: number) {
  const shared = pollUnlessFailing(healthyMs);
  return (query: PolledQuery): number => {
    const sharedMs = shared(query);
    if (query.state.status !== "error") return sharedMs;
    return Math.max(sharedMs, healthyMs * FAILING_FACTOR);
  };
}
