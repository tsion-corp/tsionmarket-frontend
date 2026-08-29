/**
 * The client's circuit breaker: what stops an outage becoming a storm.
 *
 * WHY THIS EXISTS. This app polls harder than anything else we run: live match
 * state every SECOND, tickets every second, prices and chains every few, and
 * a handful of those keep going in a hidden tab on purpose so a player who
 * switches away does not miss their turn. Every query then retries twice on
 * failure, and every request is a serverless invocation that waits on the
 * gateway before giving up.
 *
 * When the backend went down those multiplied: a one-second poll, times three
 * attempts, times a function holding memory until it times out, times every
 * open tab — including the hidden ones. The clients never noticed the backend
 * was gone; each request found out on its own, forever.
 *
 * A breaker makes that a shared fact. Once enough requests in a row have
 * failed the same way, the circuit OPENS and every subsequent call fails
 * instantly, in-process, with no network and no function invocation. One probe
 * is allowed through per cooldown to find out whether it is back.
 *
 * WHAT COUNTS AS A FAILURE is deliberately narrow: transport errors and 5xx.
 * A 401, a 404 or a validation error is the server working correctly and
 * telling us something — tripping on those would take the whole app down over
 * one bad request.
 *
 * Pure and framework-free so the state machine can be tested directly; the
 * clock is injected for the same reason.
 */

export type CircuitState = "closed" | "open" | "half-open";

export interface CircuitSnapshot {
  state: CircuitState;
  /** When the breaker will next allow a probe. Epoch ms; 0 when closed. */
  retryAt: number;
  /** Consecutive qualifying failures. Reset by any success. */
  failures: number;
}

export interface CircuitOptions {
  /** Consecutive failures before the circuit opens. */
  threshold: number;
  /** How long it stays open before a probe is allowed, in ms. */
  cooldownMs: number;
  /** Ceiling for the backoff applied to repeated failed probes. */
  maxCooldownMs: number;
}

export const DEFAULT_CIRCUIT: CircuitOptions = {
  // Three, not one: a single 502 is noise on any network, and opening on it
  // would flip the whole app into a degraded state over one dropped packet.
  threshold: 3,
  cooldownMs: 15_000,
  maxCooldownMs: 120_000,
};

/** Status codes that mean "the server is broken", as opposed to "you are". */
export function isCircuitFailure(status: number | undefined): boolean {
  // No status at all is a transport failure — DNS, TCP, CORS, offline.
  if (status === undefined) return true;
  // 502/503/504 are the gateway saying the thing behind it is not answering,
  // which is exactly the case this exists for. A 500 counts too: sustained
  // 500s are an outage even if each one is technically "handled".
  return status >= 500;
}

/** May a request go out right now? */
export function allowsRequest(snapshot: CircuitSnapshot, now: number): boolean {
  if (snapshot.state === "closed") return true;
  // Open, but the cooldown has elapsed: exactly one probe gets through, which
  // is what `half-open` records.
  return now >= snapshot.retryAt;
}

export function onFailure(
  snapshot: CircuitSnapshot,
  now: number,
  options: CircuitOptions = DEFAULT_CIRCUIT
): CircuitSnapshot {
  const failures = snapshot.failures + 1;
  if (failures < options.threshold) return { state: "closed", retryAt: 0, failures };
  // Each further failure while open pushes the next probe out, doubling to a
  // ceiling: a backend that has been down for ten minutes does not need to be
  // asked every fifteen seconds.
  const rounds = failures - options.threshold;
  const cooldown = Math.min(options.cooldownMs * 2 ** rounds, options.maxCooldownMs);
  return { state: "open", retryAt: now + cooldown, failures };
}

export function onSuccess(): CircuitSnapshot {
  return { state: "closed", retryAt: 0, failures: 0 };
}

/** The state to report while a probe is in flight, so the UI can say "checking". */
export function onProbe(snapshot: CircuitSnapshot): CircuitSnapshot {
  if (snapshot.state !== "open") return snapshot;
  return { ...snapshot, state: "half-open" };
}

export const CLOSED: CircuitSnapshot = { state: "closed", retryAt: 0, failures: 0 };
