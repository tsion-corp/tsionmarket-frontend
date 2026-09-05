/**
 * Polling cadence for a read that might be failing.
 *
 * Measured against the dev server while sitting on the dashboard: 27 requests
 * a minute, of which 17 could never succeed. `/api/perp/trades` and
 * `/api/perp/orders` answered 404, `/api/chess/matches` and
 * `/api/draughts/matches` answered 502, `/api/evm-rpc/base-mainnet` answered
 * 401. Two thirds of the traffic was a retry of something already refused.
 *
 * React Query keeps firing `refetchInterval` while every attempt errors, so a
 * broken endpoint is polled at its healthy rate for as long as the tab is
 * open, and the default `retry` turns each tick into three requests.
 *
 * Backing off rather than stopping matters: a gateway that comes back must be
 * noticed without a reload. One minute is slow enough to be nearly free and
 * fast enough that nobody sits in front of a dead panel for long.
 */
const FAILING_POLL_MS = 60_000;

/**
 * `refetchInterval` that drops to a slow cadence while the query is in error.
 *
 * Pass the healthy interval; the query is supplied by React Query on every
 * update, so the rate re-evaluates as the endpoint fails and recovers.
 */
export function pollUnlessFailing(healthyMs: number) {
  return (query: { state: { status: string } }): number =>
    query.state.status === "error" ? FAILING_POLL_MS : healthyMs;
}

/**
 * Same, for a poll that is already conditional. `healthy` may be `false` to
 * mean "do not poll at all right now", which is preserved: a query that should
 * be idle stays idle whether or not it is also failing.
 */
export function pollUnlessFailingOr(healthy: number | false) {
  return (query: { state: { status: string } }): number | false => {
    if (healthy === false) return false;
    return query.state.status === "error" ? FAILING_POLL_MS : healthy;
  };
}
