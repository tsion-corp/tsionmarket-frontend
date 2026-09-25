import { describe, expect, it } from "vitest";
import { mapWithLimit } from "@/lib/migration/concurrency";

describe("mapWithLimit", () => {
  it("returns results in input order regardless of completion order", async () => {
    const delays = [30, 5, 15];
    const out = await mapWithLimit(delays, 3, async (ms, i) => {
      await new Promise((r) => setTimeout(r, ms));
      return `${i}:${ms}`;
    });
    expect(out).toEqual(["0:30", "1:5", "2:15"]);
  });

  it("never runs more than the limit at once", async () => {
    let active = 0;
    let peak = 0;
    await mapWithLimit(
      Array.from({ length: 9 }, (_, i) => i),
      2,
      async () => {
        active++;
        peak = Math.max(peak, active);
        await new Promise((r) => setTimeout(r, 2));
        active--;
      }
    );
    expect(peak).toBe(2);
  });

  it("handles an empty list and rejects a non-positive limit", async () => {
    await expect(mapWithLimit([], 4, async () => 1)).resolves.toEqual([]);
    await expect(mapWithLimit([1], 0, async () => 1)).rejects.toThrow(/positive limit/);
  });
});
