import { describe, expect, it } from "vitest";
import {
  collateralBaseUnits,
  formatCompactUsdc,
  isLikelyClosed,
  isPositiveWireDecimal,
  isUnsetLevel,
  isWireDecimal,
  needsApproval,
  orderFieldValidity,
  parseStepValueWei,
  positionSizeBaseUnits,
  toWirePrice,
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
    minPositionUsdc: "100",
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

  it("enforces the pair's own minimum position size", () => {
    // $100 minimum: 10 x 9 = 90 fails, 10 x 10 = 100 passes.
    expect(validateOrder(pair(), "10", "9").ok).toBe(false);
    expect(validateOrder(pair(), "10", "10").ok).toBe(true);
    // The live gateway serves per-pair minimums as low as $10: 5 x 2 = 10.
    const cheap = pair({ minPositionUsdc: "10" });
    expect(validateOrder(cheap, "5", "2").ok).toBe(true);
    expect(validateOrder(cheap, "4", "2").ok).toBe(false);
    // $300 forex-style minimum. 10 x 30 = 300 passes, 10 x 29 fails.
    const fx = pair({ category: "forex", maxLeverage: 100, minPositionUsdc: "300" });
    expect(validateOrder(fx, "10", "29").ok).toBe(false);
    expect(validateOrder(fx, "10", "30").ok).toBe(true);
    // The reported minimum comes from the pair, not a category table.
    const v = validateOrder(cheap, "1", "2");
    expect(v.code).toBe("underMinPosition");
    expect(v.params?.min).toBe(10);
  });

  it("falls back to category minimums when the pair carries none", () => {
    // The synthesized preview pairs predate minPositionUsdc on the wire.
    const legacy = pair({ minPositionUsdc: undefined as unknown as string, category: "forex" });
    expect(validateOrder(legacy, "10", "29").ok).toBe(false);
    expect(validateOrder(legacy, "10", "30").ok).toBe(true);
  });

  it("rejects collateral above the balance, compared exactly", () => {
    expect(validateOrder(pair(), "100.000001", "10", "100").ok).toBe(false);
    expect(validateOrder(pair(), "100", "10", "100").ok).toBe(true);
  });
});

describe("isWireAmount precision caps", () => {
  it("caps collateral at 6 decimals and leverage at 2", () => {
    expect(validateOrder(pair(), "10.123456", "10").ok).toBe(true);
    expect(validateOrder(pair(), "10.1234567", "10").code).toBe("enterCollateral");
    expect(validateOrder(pair(), "100", "7.5").ok).toBe(true);
    expect(validateOrder(pair(), "100", "7.555").code).toBe("enterLeverage");
  });

  it("flags over-precision live in the field validity too", () => {
    expect(orderFieldValidity(pair(), "10.1234567", "").collateralInvalid).toBe(true);
    expect(orderFieldValidity(pair(), "", "7.555").leverageInvalid).toBe(true);
  });
});

describe("orderFieldValidity (live per-field feedback)", () => {
  it("flags an over-max leverage even while collateral is still empty", () => {
    const v = orderFieldValidity(pair({ maxLeverage: 10 }), "", "26");
    expect(v.leverageInvalid).toBe(true);
    expect(v.collateralInvalid).toBe(false);
  });

  it("flags collateral over balance even while leverage is empty", () => {
    const v = orderFieldValidity(pair(), "150", "", "100");
    expect(v.collateralInvalid).toBe(true);
    expect(v.leverageInvalid).toBe(false);
  });

  it("never flags pristine empty fields", () => {
    const v = orderFieldValidity(pair(), "", "");
    expect(v.collateralInvalid).toBe(false);
    expect(v.leverageInvalid).toBe(false);
  });

  it("flags leverage under 1x and malformed values", () => {
    expect(orderFieldValidity(pair(), "", "0.5").leverageInvalid).toBe(true);
    expect(orderFieldValidity(pair(), "", "0").leverageInvalid).toBe(true);
    expect(orderFieldValidity(pair(), "1.2.3", "abc")).toEqual({
      collateralInvalid: true,
      leverageInvalid: true,
    });
  });

  it("marks both fields when the position is under the pair minimum", () => {
    const v = orderFieldValidity(pair(), "5", "10");
    expect(v.collateralInvalid).toBe(true);
    expect(v.leverageInvalid).toBe(true);
    expect(orderFieldValidity(pair(), "10", "10")).toEqual({
      collateralInvalid: false,
      leverageInvalid: false,
    });
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

describe("toWirePrice", () => {
  it("renders floats as plain decimals, never scientific notation", () => {
    expect(toWirePrice(1e-7)).toBe("0.0000001");
    expect(toWirePrice(64123.5)).toBe("64123.5");
    expect(toWirePrice(2)).toBe("2");
  });

  it("returns null for values the wire cannot carry", () => {
    expect(toWirePrice(0)).toBeNull();
    expect(toWirePrice(-1)).toBeNull();
    expect(toWirePrice(NaN)).toBeNull();
    expect(toWirePrice(1e-9)).toBeNull();
  });
});

describe("formatCompactUsdc", () => {
  it("compacts the magnitudes that overflowed the stat boxes", () => {
    // The QA screenshot: depth 78,897,816.75 spilling past the card edge.
    expect(formatCompactUsdc(78897816.75)).toBe("78.9M");
    expect(formatCompactUsdc(853512.88)).toBe("853.51K");
  });

  it("keeps the sign — skew is long minus short", () => {
    expect(formatCompactUsdc(-61480.14)).toBe("-61.48K");
  });

  it("leaves small readings literal and zero as a real value", () => {
    expect(formatCompactUsdc(914.5)).toBe("914.5");
    expect(formatCompactUsdc(0)).toBe("0");
  });

  it("dashes only what is missing", () => {
    expect(formatCompactUsdc(null)).toBe("—");
    expect(formatCompactUsdc(undefined)).toBe("—");
    expect(formatCompactUsdc(Number.NaN)).toBe("—");
  });
});
