import { describe, expect, it } from "vitest";
import { rowsForHeight } from "./use-fitted-row-count";

const base = { rowHeight: 57, fallbackRows: 10, minRows: 4 };

describe("rowsForHeight", () => {
  it("fills the space with whole rows", () => {
    expect(rowsForHeight(570, base)).toBe(10);
    expect(rowsForHeight(912, base)).toBe(16);
  });

  it("floors a part row rather than clipping it", () => {
    // 10 rows and 56 of the 57 pixels an eleventh needs.
    expect(rowsForHeight(626, base)).toBe(10);
    expect(rowsForHeight(627, base)).toBe(11);
  });

  it("keeps the design's count until the space has been measured", () => {
    // A container that is not laid out yet reports 0. Reporting no rows there
    // would blank the table on first paint.
    expect(rowsForHeight(0, base)).toBe(10);
    expect(rowsForHeight(Number.NaN, base)).toBe(10);
    expect(rowsForHeight(-40, base)).toBe(10);
  });

  it("refuses a row height that cannot divide anything", () => {
    expect(rowsForHeight(570, { ...base, rowHeight: 0 })).toBe(10);
  });

  it("holds the floor on a window too short for it", () => {
    expect(rowsForHeight(60, base)).toBe(4);
  });

  it("holds the ceiling when one is set", () => {
    expect(rowsForHeight(5000, { ...base, maxRows: 20 })).toBe(20);
  });

  it("has no ceiling by default", () => {
    expect(rowsForHeight(5700, base)).toBe(100);
  });

  it("never reports zero rows even with no floor given", () => {
    expect(rowsForHeight(10, { rowHeight: 57, fallbackRows: 10 })).toBe(1);
  });
});
