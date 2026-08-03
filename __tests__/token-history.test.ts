import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { change24hFrom } = await import("@/lib/server/token-history");

const HOUR = 3_600;

function series(values: number[]): { time: number; value: number }[] {
  // Ascending hourly points ending at an arbitrary fixed instant.
  const end = 1_785_715_200;
  return values.map((value, i) => ({ time: end - (values.length - 1 - i) * HOUR, value }));
}

describe("change24hFrom", () => {
  it("reads the move against the point a day earlier", () => {
    // 25 points: the oldest is 24h before the newest.
    const values = Array.from({ length: 25 }, (_, i) => (i === 0 ? 100 : 110));
    expect(change24hFrom(series(values))).toBeCloseTo(10, 6);
  });

  it("falls back to the oldest point when history is shorter than a day", () => {
    expect(change24hFrom(series([200, 150]))).toBeCloseTo(-25, 6);
  });

  it("returns undefined when there is nothing to compare", () => {
    expect(change24hFrom([])).toBeUndefined();
    expect(change24hFrom(series([100]))).toBeUndefined();
  });

  it("ignores a zero baseline rather than dividing by it", () => {
    expect(change24hFrom([{ time: 1, value: 0 }, ...series([50])])).toBeUndefined();
  });
});
