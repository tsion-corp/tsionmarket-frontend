import { describe, expect, it } from "vitest";
import {
  collateralBaseUnits,
  isLikelyClosed,
  isPositiveWireDecimal,
  isUnsetLevel,
  isWireDecimal,
  needsApproval,
  parseStepValueWei,
  positionSizeBaseUnits,
  validateOrder,
} from "@/lib/perp/logic";
import type { PerpPair } from "@/lib/perp/types";

function pair(overrides: Partial<PerpPair> = {}): PerpPair {
  return {
    pairIndex: 1,
    from: "ETH",
    to: "USD",
    groupIndex: 0,
    group: "CRYPTO1",
    category: "crypto",
    feeIndex: 0,
    maxLeverage: 75,
    spread: { min: 0, max: 0.001 },
    maxLongOiP: 100,
    maxShortOiP: 100,
    ...overrides,
  };
}

describe("wire decimal format", () => {
  it("accepts plain decimals the API allows", () => {
    expect(isWireDecimal("100")).toBe(true);
    expect(isWireDecimal("100.5")).toBe(true);
    expect(isWireDecimal("0")).toBe(true);
    expect(isWireDecimal("0.00035")).toBe(true);
  });

  it("rejects everything the API regex rejects", () => {
    for (const bad of ["", ".5", "1.", "1.2.3", "-1", "1e5", " 1", "1 ", "abc", "0x10"]) {
      expect(isWireDecimal(bad)).toBe(false);
    }
  });

  it("positivity is decided on the string, never through float collapse", () => {
    expect(isPositiveWireDecimal("0")).toBe(false);
    expect(isPositiveWireDecimal("0.000")).toBe(false);
    expect(isPositiveWireDecimal(`0.${"0".repeat(400)}1`)).toBe(true);
    expect(isPositiveWireDecimal("100")).toBe(true);
  });
});

describe("exact position math", () => {
  it("converts collateral to USDC base units exactly", () => {
    expect(collateralBaseUnits("100")).toBe(100_000_000n);
    expect(collateralBaseUnits("100.5")).toBe(100_500_000n);
    expect(collateralBaseUnits("0.000001")).toBe(1n);
  });

  it("computes position size with fractional leverage exactly", () => {
    expect(positionSizeBaseUnits("100", "10")).toBe(1_000_000_000n);
    expect(positionSizeBaseUnits("100", "7.5")).toBe(750_000_000n);
    // 0.1 * 3 style float drift would show here; bigint math does not drift.
    expect(positionSizeBaseUnits("0.3", "3")).toBe(900_000n);
  });
});

describe("validateOrder", () => {
  it("accepts a well-formed crypto order at the minimum", () => {
    expect(validateOrder(pair(), "10", "10").ok).toBe(true);
  });

  it("rejects empty or malformed inputs", () => {
    expect(validateOrder(pair(), "", "10").ok).toBe(false);
    expect(validateOrder(pair(), "100", "").ok).toBe(false);
    expect(validateOrder(pair(), "1.2.3", "10").ok).toBe(false);
  });

  it("enforces the pair's max leverage", () => {
    const v = validateOrder(pair({ maxLeverage: 25 }), "100", "26");
    expect(v.ok).toBe(false);
    expect(v.message).toContain("25x");
  });

  it("rejects leverage under 1x", () => {
    expect(validateOrder(pair(), "100", "0.5").ok).toBe(false);
  });

  it("enforces the category minimum position size", () => {
    // Crypto: $100 minimum. 10 x 9 = 90 fails, 10 x 10 = 100 passes.
    expect(validateOrder(pair(), "10", "9").ok).toBe(false);
    expect(validateOrder(pair(), "10", "10").ok).toBe(true);
    // Forex: $300 minimum. 10 x 30 = 300 passes, 10 x 29 fails.
    const fx = pair({ category: "forex", maxLeverage: 100 });
    expect(validateOrder(fx, "10", "29").ok).toBe(false);
    expect(validateOrder(fx, "10", "30").ok).toBe(true);
  });

  it("rejects collateral above the balance, compared exactly", () => {
    expect(validateOrder(pair(), "100.000001", "10", "100").ok).toBe(false);
    expect(validateOrder(pair(), "100", "10", "100").ok).toBe(true);
  });
});

describe("market hours", () => {
  const now = 1_800_000_000;

  it("crypto never reads as closed", () => {
    expect(isLikelyClosed("crypto", null, now)).toBe(false);
    expect(isLikelyClosed("crypto", now - 100_000, now)).toBe(false);
  });

  it("a stale or missing price marks non-crypto markets closed", () => {
    expect(isLikelyClosed("forex", now - 10, now)).toBe(false);
    expect(isLikelyClosed("forex", now - 600, now)).toBe(true);
    expect(isLikelyClosed("equities", null, now)).toBe(true);
  });
});

describe("allowance and steps", () => {
  it("needsApproval compares in exact base units", () => {
    expect(needsApproval(99_999_999n, "100")).toBe(true);
    expect(needsApproval(100_000_000n, "100")).toBe(false);
  });

  it("parses step wei values and rejects garbage", () => {
    expect(parseStepValueWei("0")).toBe(0n);
    expect(parseStepValueWei("350000000000000")).toBe(350_000_000_000_000n);
    expect(() => parseStepValueWei("0x123")).toThrow();
    expect(() => parseStepValueWei("-1")).toThrow();
    expect(() => parseStepValueWei("1.5")).toThrow();
  });

  it("accepts the deployed gateway's numeric zero but rejects unsafe numbers", () => {
    // approve-usdc steps arrive with value: 0 (a JSON number) in production.
    expect(parseStepValueWei(0)).toBe(0n);
    expect(parseStepValueWei(350_000_000_000_000)).toBe(350_000_000_000_000n);
    // Anything past 2^53 already lost precision in JSON and must never sign.
    expect(() => parseStepValueWei(9_007_199_254_740_993)).toThrow();
    expect(() => parseStepValueWei(-1)).toThrow();
    expect(() => parseStepValueWei(1.5)).toThrow();
  });

  it('treats "0" TP/SL as unset', () => {
    expect(isUnsetLevel("0")).toBe(true);
    expect(isUnsetLevel("0.00")).toBe(true);
    expect(isUnsetLevel("3500.42")).toBe(false);
  });
});
