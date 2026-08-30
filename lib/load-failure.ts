/**
 * What a reader should be told when a panel could not load.
 *
 * Two rules, and they are the whole of it.
 *
 * ONE: never print the exception. `error.message` is written for whoever is
 * reading the logs — "fetch failed", "HTTP 502", "Can't reach the server right
 * now", sometimes a stack fragment. Showing that to a person is not honesty,
 * it is abdication: it names something they cannot act on, in language that
 * makes a routine hiccup look like the app is broken.
 *
 * TWO: red is for MONEY. A trade that did not go through, a bet that was
 * rejected, a balance that moved unexpectedly — those earn alarm. A list that
 * has not arrived yet has not hurt anybody, and dressing it in the same colour
 * spends the reader's alarm on nothing, so the one time it matters they have
 * already learned to ignore it.
 *
 * The distinction this file draws is between "the server is unreachable and we
 * are already handling it", which the connection bar is announcing, and "this
 * particular thing failed", which is the panel's own business.
 */

export type LoadFailureKind =
  /** The whole backend is unreachable. The app already knows and is retrying. */
  | "offline"
  /** This service is not switched on in this environment. */
  | "unconfigured"
  /** Something else went wrong fetching this one thing. */
  | "other";

/** Messages that mean "the transport failed", in any of the shapes we produce. */
const OFFLINE = /can't reach the server|failed to fetch|networkerror|load failed|fetch failed/i;

export function classifyLoadFailure(error: unknown, unconfigured: boolean): LoadFailureKind {
  if (unconfigured) return "unconfigured";
  const message = error instanceof Error ? error.message : String(error ?? "");
  return OFFLINE.test(message) ? "offline" : "other";
}

/**
 * Whether the panel should offer its own retry.
 *
 * It should not while the app is already retrying for it: a button that cannot
 * work teaches the reader that buttons do not work, and a frustrated reader
 * tapping five of them is the stampede the breaker exists to stop.
 */
export function offersRetry(kind: LoadFailureKind, circuitOpen: boolean): boolean {
  if (kind === "unconfigured") return false;
  return !circuitOpen;
}
