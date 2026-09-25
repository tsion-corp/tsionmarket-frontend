import { describe, expect, it } from "vitest";
import {
  baseUnitsOf,
  compareAmounts,
  formatAmount,
  isZeroAmount,
  sumAmounts,
  toDecimalString,
} from "@/lib/balance/amount";
import type { TokenAmount } from "@/lib/balance/types";

const eth = (baseUnits: string): TokenAmount => ({ baseUnits, decimals: 18 });
const usdc = (baseUnits: string): TokenAmount => ({ baseUnits, decimals: 6 });

describe("baseUnitsOf", () => {
  it("reads the sample payload's ETH balance exactly", () => {
    expect(baseUnitsOf(eth("504709067444182"))).toBe(504709067444182n);
  });

  it("keeps every digit of a figure a double could not hold", () => {
    // One thousand ETH in wei is 1e21, well past 2^53.
    const wei = "1000000000000000000001";
    expect(baseUnitsOf(eth(wei)).toString()).toBe(wei);
    expect(String(Number(wei))).not.toBe(wei);
  });

  it("throws on a figure it cannot read rather than calling it zero", () => {
    expect(() => baseUnitsOf(eth("not-a-balance"))).toThrow();
  });
});

describe("toDecimalString", () => {
  it("renders the sample balances", () => {
    expect(toDecimalString(eth("504709067444182"))).toBe("0.000504709067444182");
    expect(toDecimalString(usdc("128718"))).toBe("0.128718");
  });

  it("renders a whole number without a trailing point", () => {
    expect(toDecimalString(usdc("2500000"))).toBe("2.5");
    expect(toDecimalString(usdc("3000000"))).toBe("3");
    expect(toDecimalString(usdc("0"))).toBe("0");
  });

  it("survives a figure past the safe integer range", () => {
    expect(toDecimalString(eth("123456789012345678912345"))).toBe("123456.789012345678912345");
  });
});

describe("compareAmounts", () => {
  it("orders two amounts of the same asset", () => {
    expect(compareAmounts(usdc("128718"), usdc("128719"))).toBe(-1);
    expect(compareAmounts(usdc("128719"), usdc("128718"))).toBe(1);
    expect(compareAmounts(usdc("128718"), usdc("128718"))).toBe(0);
  });

  it("orders across different decimals without truncating either side", () => {
    // 0.128718 USDC against 0.000504709067444182 ETH: the ETH figure is the
    // smaller quantity, and scaling the 6-decimal side up is what keeps that
    // true. Scaling the 18-decimal side DOWN to six places would round it to
    // 0.000504 and still work here — so the case that matters is the next one.
    expect(compareAmounts(usdc("128718"), eth("504709067444182"))).toBe(1);
  });

  it("does not call two different dust amounts equal", () => {
    // Both round to 0.000000 at six places. Scaling down would tie them.
    expect(compareAmounts(eth("1"), eth("2"))).toBe(-1);
    expect(compareAmounts(usdc("0"), eth("1"))).toBe(-1);
  });

  it("treats the same quantity written at two scales as equal", () => {
    // 1.5 in both.
    expect(compareAmounts(usdc("1500000"), eth("1500000000000000000"))).toBe(0);
  });
});

describe("sumAmounts", () => {
  it("adds two amounts of the same asset", () => {
    expect(sumAmounts([usdc("128718"), usdc("1000000")])).toEqual(usdc("1128718"));
  });

  it("adds across different decimals without losing either side", () => {
    // 0.128718 USDC + 1.5 ETH-scaled, carried at the finer of the two scales
    // so the 18-decimal digits survive the addition.
    const total = sumAmounts([usdc("128718"), eth("1500000000000000000")]);
    expect(total).toEqual(eth("1628718000000000000"));
    expect(toDecimalString(total)).toBe("1.628718");
  });

  it("keeps a digit a double would round away", () => {
    // 2^53 + 1 base units of USDC, plus one base unit twelve places below it.
    const total = sumAmounts([usdc("9007199254740993"), eth("1")]);
    expect(toDecimalString(total)).toBe("9007199254.740993000000000001");
  });

  it("sums nothing to exactly zero", () => {
    expect(sumAmounts([])).toEqual({ baseUnits: "0", decimals: 0 });
    expect(toDecimalString(sumAmounts([]))).toBe("0");
  });
});

describe("isZeroAmount", () => {
  it("tells a holding of nothing from dust", () => {
    expect(isZeroAmount(eth("0"))).toBe(true);
    expect(isZeroAmount(eth("1"))).toBe(false);
  });
});

describe("formatAmount", () => {
  it("shows dust rather than rounding it to zero", () => {
    expect(formatAmount(eth("504709067444182"))).toBe("0.0005047");
    expect(formatAmount(usdc("128718"))).toBe("0.1287");
  });

  it("groups a large holding", () => {
    expect(formatAmount(usdc("1234567890000"))).toBe("1,234,567.89");
  });

  it("shows nothing as 0", () => {
    expect(formatAmount(usdc("0"))).toBe("0");
  });
});
