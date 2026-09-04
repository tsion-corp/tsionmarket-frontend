import { describe, expect, it } from "vitest";
import { pollUnlessFailing, retryUnlessUnavailable } from "@/features/trade/hooks/use-perp-markets";

/** A React Query state shape, only the field these predicates read. */
const state = (status: "success" | "error" | "pending") => ({ state: { status } });

function withCode(code: string): Error & { code: string } {
  const error = new Error(code) as Error & { code: string };
  error.code = code;
  return error;
}

describe("pollUnlessFailing", () => {
  it("polls at the healthy cadence while the read is working", () => {
    expect(pollUnlessFailing(5_000)(state("success"))).toBe(5_000);
  });

  it("backs off once the read is failing", () => {
    // The bug this exists for: a gateway answering NOT_FOUND was asked again
    // every 5s for as long as the tab stayed open.
    expect(pollUnlessFailing(5_000)(state("error"))).toBe(60_000);
  });

  it("does not stop polling entirely, so the UI recovers on its own", () => {
    expect(pollUnlessFailing(5_000)(state("error"))).toBeGreaterThan(0);
  });

  it("keeps the healthy cadence while the first read is still in flight", () => {
    expect(pollUnlessFailing(5_000)(state("pending"))).toBe(5_000);
  });
});

describe("retryUnlessUnavailable", () => {
  it("does not retry a pair the gateway says it does not have", () => {
    // Asking twice more cannot change a NOT_FOUND, and it tripled the cost of
    // every failing poll.
    expect(retryUnlessUnavailable(0, withCode("NOT_FOUND"))).toBe(false);
  });

  it("does not retry when the service is not deployed", () => {
    expect(retryUnlessUnavailable(0, withCode("NOT_CONFIGURED"))).toBe(false);
    expect(retryUnlessUnavailable(0, withCode("SERVICE_UNAVAILABLE"))).toBe(false);
  });

  it("still retries a failure that might genuinely be transient", () => {
    expect(retryUnlessUnavailable(0, withCode("INTERNAL_ERROR"))).toBe(true);
    expect(retryUnlessUnavailable(1, withCode("INTERNAL_ERROR"))).toBe(true);
  });

  it("gives up on a transient failure after two attempts", () => {
    expect(retryUnlessUnavailable(2, withCode("INTERNAL_ERROR"))).toBe(false);
  });

  it("treats an error with no code as possibly transient", () => {
    expect(retryUnlessUnavailable(0, new Error("network"))).toBe(true);
  });
});
