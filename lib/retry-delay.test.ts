import { describe, expect, it } from "vitest";
import { retryDelay } from "@/lib/retry-delay";

describe("retryDelay", () => {
  // The delays were exactly 1s, 2s, 4s — so every client that failed at the
  // same moment retried at the same moment. That synchronised wave is what
  // hits a recovering backend and knocks it over again.
  it("never returns the same delay for the same attempt", () => {
    const delays = new Set(Array.from({ length: 50 }, () => retryDelay(0)));
    expect(delays.size > 10).toBe(true);
  });

  it("still backs off, and stays inside half..full of the base", () => {
    for (const [attempt, base] of [
      [0, 1000],
      [1, 2000],
      [2, 4000],
      [3, 8000],
    ] as const) {
      expect(retryDelay(attempt, () => 0)).toBe(base / 2);
      expect(retryDelay(attempt, () => 1)).toBe(base);
    }
  });

  it("is capped, so a long outage cannot produce a minute-long wait", () => {
    expect(retryDelay(20, () => 1)).toBe(8000);
  });
});
