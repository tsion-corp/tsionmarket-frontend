import { describe, it, expect } from "vitest";
import { amountUsd, potBreakdown, unitsToWei, usdToWei, weiToUnits } from "@/lib/casino/money";

describe("casino money", () => {
  describe("usdToWei", () => {
    it("converts a dollar stake into an exact wei amount", () => {
      // $100 at $2000 a unit is exactly 0.05 units. Doing this division in
      // floating point used to leave three wei of dust on the end.
      expect(usdToWei(100, 2000)).toBe(5n * 10n ** 16n);
      expect(usdToWei(2000, 2000)).toBe(10n ** 18n);
      expect(usdToWei(1, 4)).toBe(25n * 10n ** 16n);
    });

    it("stays exact for prices that are not round numbers", () => {
      // $50 at $2500.50 a unit. Computed in integer space, so the result is
      // reproducible rather than dependent on float representation.
      const wei = usdToWei(50, 2500.5);
      expect(wei).toBe((50_000_000n * 10n ** 18n) / 2_500_500_000n);
    });

    it("refuses to guess when the amount or price is unusable", () => {
      expect(usdToWei(0, 2000)).toBe(0n);
      expect(usdToWei(-5, 2000)).toBe(0n);
      expect(usdToWei(100, 0)).toBe(0n);
      expect(usdToWei(Number.NaN, 2000)).toBe(0n);
      expect(usdToWei(100, Number.POSITIVE_INFINITY)).toBe(0n);
    });
  });

  describe("unitsToWei", () => {
    it("parses clean decimals", () => {
      expect(unitsToWei("1")).toBe(10n ** 18n);
      expect(unitsToWei("0.05")).toBe(5n * 10n ** 16n);
    });

    it("rejects anything that isn't a plain amount", () => {
      expect(() => unitsToWei("abc")).toThrow();
      expect(() => unitsToWei("")).toThrow();
      expect(() => unitsToWei(".")).toThrow();
      expect(() => unitsToWei("1,000")).toThrow();
    });
  });

  describe("potBreakdown", () => {
    it("doubles the stake and takes 5% of the pot", () => {
      const { potWei, feeWei, payoutWei } = potBreakdown(10n ** 18n);
      expect(potWei).toBe(2n * 10n ** 18n);
      expect(feeWei).toBe(10n ** 17n);
      expect(payoutWei).toBe(19n * 10n ** 17n);
    });

    it("never pays out more than the pot, even on dust amounts", () => {
      for (const stake of [1n, 7n, 19n, 999n]) {
        const { potWei, feeWei, payoutWei } = potBreakdown(stake);
        expect(feeWei + payoutWei).toBe(potWei);
        expect(payoutWei).toBeLessThanOrEqual(potWei);
      }
    });
  });

  it("weiToUnits round-trips a whole unit", () => {
    expect(weiToUnits((10n ** 18n).toString())).toBe(1);
  });

  describe("amountUsd", () => {
    it("prefers the gateway's own valuation", () => {
      expect(
        amountUsd({ wei: (10n ** 18n).toString(), tokenSymbol: "ETH", usdValue: 1234 }, 2000)
      ).toBe(1234);
    });

    it("falls back to the platform unit price when the gateway sends none", () => {
      expect(
        amountUsd({ wei: (10n ** 18n).toString(), tokenSymbol: "ETH", usdValue: 0 }, 2000)
      ).toBe(2000);
    });

    it("treats a missing amount as zero", () => {
      expect(amountUsd(null, 2000)).toBe(0);
    });
  });
});
