import { describe, expect, it } from "vitest";
import { formatCompact } from "@/lib/square/format-count";

describe("formatCompact", () => {
  it("leaves small counts alone", () => {
    expect(formatCompact(0)).toBe("0");
    expect(formatCompact(7)).toBe("7");
    expect(formatCompact(999)).toBe("999");
  });

  it("compacts thousands with one decimal below ten", () => {
    expect(formatCompact(1000)).toBe("1K");
    expect(formatCompact(1247)).toBe("1.2K");
    expect(formatCompact(9990)).toBe("9.9K");
  });

  it("drops the decimal once the leading number is two digits", () => {
    expect(formatCompact(12_400)).toBe("12K");
    expect(formatCompact(204_400)).toBe("204K");
  });

  // Never claim to be bigger than you are.
  it("rounds down, so a count never overstates itself", () => {
    expect(formatCompact(1999)).toBe("1.9K");
    expect(formatCompact(999_999)).toBe("999K");
  });

  it("handles millions and billions", () => {
    expect(formatCompact(1_500_000)).toBe("1.5M");
    expect(formatCompact(2_000_000_000)).toBe("2B");
  });

  it("treats nonsense as zero rather than rendering NaN under an icon", () => {
    expect(formatCompact(Number.NaN)).toBe("0");
    expect(formatCompact(-5)).toBe("0");
  });
});
