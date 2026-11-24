import { describe, expect, it } from "vitest";
import {
  fiatForToken,
  formatUnits,
  groupDecimal,
  isDecimalString,
  parseUnits,
  tokenForFiat,
} from "./amounts";

describe("parseUnits", () => {
  it("reads plain decimals into exact base units", () => {
    expect(parseUnits("10", 6)).toBe(10_000_000n);
    expect(parseUnits("0.000001", 6)).toBe(1n);
    expect(parseUnits("123.45", 2)).toBe(12_345n);
  });

  it("refuses what would have to be rounded or is not a number", () => {
    expect(parseUnits("0.0000001", 6)).toBeNull();
    expect(parseUnits("1.234", 2)).toBeNull();
    for (const bad of ["", "-1", "1e3", "1.", ".5", "abc", "1,000"]) {
      expect(parseUnits(bad, 6)).toBeNull();
    }
  });

  it("round-trips through formatUnits without trailing zeros", () => {
    expect(formatUnits(parseUnits("100.50", 6)!, 6)).toBe("100.5");
    expect(formatUnits(0n, 6)).toBe("0");
    expect(formatUnits(5n, 2)).toBe("0.05");
  });
});

describe("rate conversions", () => {
  it("prices tokens in fiat exactly, rounding down", () => {
    // 10 USDC at 1441.2 NGN = 14,412.00 NGN
    expect(fiatForToken(10_000_000n, 6, "1441.2", 2)).toBe(1_441_200n);
    // 0.333333 USDC at 3 = 0.999999 -> 0.99
    expect(fiatForToken(333_333n, 6, "3", 2)).toBe(99n);
  });

  it("prices fiat in tokens exactly, rounding down", () => {
    expect(tokenForFiat(1_441_200n, 2, "1441.2", 6)).toBe(10_000_000n);
  });

  it("returns null for a missing or zero rate instead of dividing by it", () => {
    expect(fiatForToken(1n, 6, "0", 2)).toBeNull();
    expect(tokenForFiat(1n, 2, "nope", 6)).toBeNull();
  });
});

describe("display helpers", () => {
  it("groups thousands and keeps decimals", () => {
    expect(groupDecimal("1234567.5")).toBe("1,234,567.5");
    expect(groupDecimal("999")).toBe("999");
  });

  it("recognises decimal strings", () => {
    expect(isDecimalString("1.5")).toBe(true);
    expect(isDecimalString("1.5.5")).toBe(false);
  });
});
