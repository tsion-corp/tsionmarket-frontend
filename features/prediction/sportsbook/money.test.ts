import { describe, expect, it } from "vitest";
import {
  atomicToDecimal,
  combinedOdds,
  compareDecimals,
  decimalToAtomic,
  estimatedPayout,
  formatUsdcAmount,
  settlementTokenPriceUsd,
  tokenToUsdcAmount,
  usdcToTokenAmount,
} from "./money";

describe("sportsbook money", () => {
  it("converts WETH values without floating point loss", () => {
    expect(decimalToAtomic("0.001", 18)).toBe(1_000_000_000_000_000n);
    expect(atomicToDecimal("1234500000000000000", 18)).toBe("1.2345");
  });

  it("rejects precision beyond the token decimals", () => {
    expect(decimalToAtomic("1.0000001", 6)).toBeNull();
  });

  it("combines odds and calculates payout using integers", () => {
    expect(combinedOdds(["1.50", "2.00", "1.25"])).toBe("3.75");
    expect(estimatedPayout("0.01", "3.75", 18)).toBe("0.0375");
  });

  it("compares decimal limits exactly", () => {
    expect(compareDecimals("0.009", "0.01", 18)).toBe(-1);
    expect(compareDecimals("0.010", "0.01", 18)).toBe(0);
  });

  it("converts the USDC display amount to exact WETH settlement units", () => {
    const weth = usdcToTokenAmount("5", 4_000, 18);
    expect(weth).toBe("0.00125");
    expect(tokenToUsdcAmount(weth as string, 4_000, 18)).toBe("5");
  });

  it("resolves only supported settlement-token prices", () => {
    expect(settlementTokenPriceUsd("USDC", 0)).toBe(1);
    expect(settlementTokenPriceUsd("WETH", 4_000)).toBe(4_000);
    expect(settlementTokenPriceUsd("WETH", 0)).toBeNull();
    expect(settlementTokenPriceUsd("UNKNOWN", 4_000)).toBeNull();
  });

  it("formats user-facing USDC values without false zeroes", () => {
    expect(formatUsdcAmount("1234.567")).toBe("1,234.57");
    expect(formatUsdcAmount("0.004")).toBe("<0.01");
  });
});
