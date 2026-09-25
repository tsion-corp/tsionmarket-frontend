import { describe, expect, it } from "vitest";
import { decimalToBaseUnits, holdingId, usdValue } from "@/lib/migration/holding";

describe("holding helpers", () => {
  it("builds stable ids", () => {
    expect(holdingId("perps", "position", "3:0")).toBe("perps:position:3:0");
  });

  it("converts gateway decimal strings to exact base units", () => {
    expect(decimalToBaseUnits("12.5", 6)).toBe(12_500_000n);
    expect(decimalToBaseUnits("0.000001", 6)).toBe(1n);
    expect(decimalToBaseUnits("7", 6)).toBe(7_000_000n);
    expect(decimalToBaseUnits("1.23456789", 6)).toBe(1_234_567n);
    expect(decimalToBaseUnits("abc", 6)).toBe(0n);
    expect(decimalToBaseUnits("-1", 6)).toBe(0n);
  });

  it("prices base units for display", () => {
    expect(usdValue(2_500_000n, 6, 1)).toBe(2.5);
    expect(usdValue(10n ** 18n, 18, 3000)).toBe(3000);
  });
});
