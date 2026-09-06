"use client";

import { useSyncExternalStore } from "react";
import {
  CLOSED,
  type CircuitSnapshot,
  allowsRequest,
  isCircuitFailure,
  onFailure,
  onProbe,
  onSuccess,
} from "@/lib/api/circuit";

/**
 * The live breakers: one per upstream service, shared by every request the
 * app makes to it.
 *
 * Held outside React because the fetch layer is not a component and must be
 * able to ask "is this service up?" without one. The UI subscribes to a
 * summary of the same state, which is what lets a single banner speak for
 * every query at once instead of forty rows each announcing the same outage.
 *
 * One breaker per service, not one for the app. Every route under /api proxies
 * a different upstream: the balance comes from Alchemy, live chess from the
 * chess gateway, a Kash figure from the referral engine. With a single breaker
 * three 502s from the chess gateway, polled by a decorative strip nobody was
 * reading, opened the circuit for everything, and the balance stopped loading
 * while the banner told the user the server was unreachable. It was not; one
 * game backend was. The service is the first path segment after /api, so
 * /api/chess/matches and /api/chess/games share a breaker and /api/portfolio
 * has its own.
 */

/**
 * Services whose outage the app does not announce. Each degrades on its own
 * terms already: the marquee drops the chips it cannot fill, the arcade hub
 * shows its tiles without live counts. Their breakers still open and still
 * stop the polling, which is the part that costs money; they just do not put
 * "can't reach the server" over a balance that loaded fine.
 */
export const QUIET_SERVICES: ReadonlySet<string> = new Set([
  "chess",
  "draughts",
  "vault",
  "market-square",
  "square",
  "labs",
  "demo",
  "token-logo",
  "token-logos",
  "token-chart-id",
]);

/** The service a request path belongs to: the segment after /api, or "app". */
export function circuitServiceOf(path: string): string {
  const match = /^\/api\/([^/?#]+)/.exec(path);
  return match ? match[1] : "app";
}

const circuits = new Map<string, CircuitSnapshot>();
const listeners = new Set<() => void>();

// The summary the UI reads: the loud services folded into one snapshot. Kept
// as a stable object between changes so useSyncExternalStore does not see a
// new value on every read.
let summary: CircuitSnapshot = CLOSED;

function summarise(): CircuitSnapshot {
  let state: CircuitSnapshot["state"] = "closed";
  let retryAt = Number.POSITIVE_INFINITY;
  let failures = 0;
  for (const [service, circuit] of circuits) {
    if (QUIET_SERVICES.has(service) || circuit.state === "closed") continue;
    // Open outranks half-open: the banner says "retrying" only when every
    // open circuit is probing.
    if (circuit.state === "open" || state === "closed") state = circuit.state;
    retryAt = Math.min(retryAt, circuit.retryAt);
    failures = Math.max(failures, circuit.failures);
  }
  if (state === "closed") return CLOSED;
  return { state, retryAt, failures };
}

function publish(service: string, next: CircuitSnapshot) {
  circuits.set(service, next);
  const before = summary;
  summary = summarise();
  // Every field the summary carries is part of "changed". Comparing only the
  // state and the retry time let the failure count move without a
  // notification once an open circuit's backoff had reached its ceiling.
  if (
    summary.state === before.state &&
    summary.retryAt === before.retryAt &&
    summary.failures === before.failures
  ) {
    return;
  }
  for (const listener of listeners) listener();
}

function circuitFor(service: string): CircuitSnapshot {
  return circuits.get(service) ?? CLOSED;
}

/** The loud services folded into one: what the banner shows. */
export function circuitSnapshot(): CircuitSnapshot {
  return summary;
}

/** True when a request to `path` may go out. A probe flips its service's state so the UI can say so. */
export function circuitAllows(path: string, now = Date.now()): boolean {
  const service = circuitServiceOf(path);
  const circuit = circuitFor(service);
  if (allowsRequest(circuit, now)) {
    if (circuit.state === "open") publish(service, onProbe(circuit));
    return true;
  }
  return false;
}

export function recordCircuitFailure(path: string, status?: number, now = Date.now()): void {
  if (!isCircuitFailure(status)) return;
  const service = circuitServiceOf(path);
  const circuit = circuitFor(service);
  publish(
    service,
    onFailure({ ...circuit, state: circuit.state === "half-open" ? "open" : circuit.state }, now)
  );
}

export function recordCircuitSuccess(path: string): void {
  const service = circuitServiceOf(path);
  const circuit = circuitFor(service);
  if (circuit.state === "closed" && circuit.failures === 0) return;
  publish(service, onSuccess());
}

/** Manual "try again": drops every cooldown so the next request to each service goes out now. */
export function retryCircuitNow(): void {
  for (const [service, circuit] of circuits) {
    if (circuit.state === "closed") continue;
    publish(service, { ...circuit, state: "half-open", retryAt: 0 });
  }
}

/** Test seam: the breakers are module state, so a suite must be able to clear them. */
export function resetCircuitForTest(): void {
  circuits.clear();
  const before = summary;
  summary = CLOSED;
  if (before.state !== "closed") for (const listener of listeners) listener();
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

function serverSnapshot(): CircuitSnapshot {
  return CLOSED;
}

export function useCircuit(): CircuitSnapshot {
  return useSyncExternalStore(subscribe, circuitSnapshot, serverSnapshot);
}
