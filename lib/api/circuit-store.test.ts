// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import {
  circuitAllows,
  circuitServiceOf,
  circuitSnapshot,
  recordCircuitFailure,
  recordCircuitSuccess,
  readRetryAt,
  recordReadRateLimit,
  resetCircuitForTest,
  retryCircuitNow,
  useCircuit,
} from "@/lib/api/circuit-store";

const NOW = 1_000_000;

function fail(path: string, times: number) {
  for (let i = 0; i < times; i += 1) recordCircuitFailure(path, 502, NOW);
}

describe("circuit store", () => {
  beforeEach(() => {
    resetCircuitForTest();
  });

  it("names a service by the segment after /api", () => {
    expect(circuitServiceOf("/api/chess/matches?status=active")).toBe("chess");
    expect(circuitServiceOf("/api/portfolio?evm=0x1")).toBe("portfolio");
    expect(circuitServiceOf("/api/evm-rpc/base-mainnet")).toBe("evm-rpc");
    expect(circuitServiceOf("/somewhere/else")).toBe("app");
  });

  it("keeps a dead game gateway from stopping the balance", () => {
    // The screenshot that prompted this: chess and draughts 502ing every
    // tick from the marquee, and the portfolio refused in-process because the
    // one breaker had opened.
    fail("/api/chess/matches", 3);
    fail("/api/draughts/matches", 3);

    expect(circuitAllows("/api/chess/matches", NOW)).toBe(false);
    expect(circuitAllows("/api/draughts/matches", NOW)).toBe(false);
    expect(circuitAllows("/api/portfolio", NOW)).toBe(true);
    expect(circuitAllows("/api/prices", NOW)).toBe(true);
  });

  it("does not raise the banner for a quiet service", () => {
    fail("/api/chess/matches", 5);
    expect(circuitSnapshot().state).toBe("closed");
  });

  it("raises the banner when a service the app depends on is down", () => {
    fail("/api/portfolio", 3);
    expect(circuitSnapshot().state).toBe("open");
    expect(circuitSnapshot().retryAt).toBeGreaterThan(NOW);
  });

  it("reports the soonest retry across open services", () => {
    fail("/api/portfolio", 3);
    const first = circuitSnapshot().retryAt;
    // A fourth failure pushes this service's probe further out.
    fail("/api/prices", 4);
    expect(circuitSnapshot().retryAt).toBe(first);
  });

  it("closes a service on its own success and leaves the others alone", () => {
    fail("/api/portfolio", 3);
    fail("/api/prices", 3);
    recordCircuitSuccess("/api/portfolio");

    expect(circuitAllows("/api/portfolio", NOW)).toBe(true);
    expect(circuitAllows("/api/prices", NOW)).toBe(false);
    expect(circuitSnapshot().state).not.toBe("closed");
  });

  it("try again drops every cooldown at once", () => {
    fail("/api/portfolio", 3);
    fail("/api/chess/matches", 3);
    retryCircuitNow();

    expect(circuitAllows("/api/portfolio", NOW)).toBe(true);
    expect(circuitAllows("/api/chess/matches", NOW)).toBe(true);
  });

  it("tells subscribers about every failure, even when the retry time cannot move", () => {
    const { result } = renderHook(() => useCircuit());
    // Enough failures at one frozen instant to reach the cooldown ceiling,
    // after which each further failure changes only the count.
    act(() => fail("/api/portfolio", 12));
    const atCeiling = result.current;
    act(() => fail("/api/portfolio", 1));

    expect(result.current.retryAt).toBe(atCeiling.retryAt);
    expect(result.current.failures).toBe(13);
  });

  it("ignores statuses that mean the server is working", () => {
    recordCircuitFailure("/api/portfolio", 401, NOW);
    recordCircuitFailure("/api/portfolio", 404, NOW);
    recordCircuitFailure("/api/portfolio", 429, NOW);
    expect(circuitSnapshot().state).toBe("closed");
  });

  it("honors an HTTP-date Retry-After for all reads of that service", () => {
    const retryAt = NOW + 90_000;
    recordReadRateLimit("/api/arkjet/rounds/current", new Date(retryAt).toUTCString(), NOW);
    expect(readRetryAt("/api/arkjet/bets/balance", NOW)).toBe(retryAt);
    expect(readRetryAt("/api/portfolio", NOW)).toBeNull();
    expect(readRetryAt("/api/arkjet/rounds/current", retryAt)).toBeNull();
  });

  it.each([null, "invalid", "-2", "0"])("uses a safe cooldown for Retry-After %s", (header) => {
    recordReadRateLimit("/api/arkjet/bets/balance", header, NOW);
    expect(readRetryAt("/api/arkjet/rounds/current", NOW)).toBe(NOW + 60_000);
  });

  it("does not clear a rate-limit cooldown when an earlier request succeeds", () => {
    recordReadRateLimit("/api/arkjet/bets/balance", "90", NOW);
    recordCircuitSuccess("/api/arkjet/rounds/current");
    recordReadRateLimit("/api/arkjet/bets/current", "1", NOW);
    expect(readRetryAt("/api/arkjet/rounds/current", NOW)).toBe(NOW + 90_000);
  });
});
