import { describe, expect, it } from "vitest";
import {
  decimalOdds,
  formatDecimalOddsE6,
  formatUsdcE6,
  stakeToE6,
  usdcInputFromE6,
} from "./format";

describe("first-party sportsbook formatting", () => {
  it("converts decimal USDC without floating-point writes", () => {
    expect(stakeToE6("0.1")).toBe("100000");
    expect(stakeToE6("12.345678")).toBe("12345678");
    expect(stakeToE6("1.0000001")).toBeNull();
  });

  it("renders API odds and money", () => {
    expect(decimalOdds("1763070")).toBeCloseTo(1.76307);
    expect(formatDecimalOddsE6("1050000")).toBe("1.050");
    expect(formatDecimalOddsE6("1000690")).toBe("1.0007");
    expect(formatDecimalOddsE6("1000000")).toBe("1.0000");
    expect(formatUsdcE6("12345678")).toBe("12.35");
    expect(usdcInputFromE6("12345678")).toBe("12.345678");
    expect(usdcInputFromE6(100_000n)).toBe("0.1");
  });
});
