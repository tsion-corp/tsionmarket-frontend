import { describe, expect, it } from "vitest";
import { groupBaseUnits, parseBaseUnits } from "@/features/trade/components/meme-base-units";

// This pair sits between the chain and the screen, so its whole job is to lose
// nothing. The cases below are the ones a float would get wrong.

describe("reading a base-unit string", () => {
  it("reads an integer past 2^53 exactly", () => {
    expect(parseBaseUnits("12345678900000000000000")).toBe(12345678900000000000000n);
  });

  it("ignores the whitespace an upstream field can carry", () => {
    expect(parseBaseUnits("  4500  ")).toBe(4500n);
  });

  it("refuses anything that is not an integer rather than guessing", () => {
    expect(parseBaseUnits("12.5")).toBeNull();
    expect(parseBaseUnits("-1")).toBeNull();
    expect(parseBaseUnits("1e21")).toBeNull();
    expect(parseBaseUnits("")).toBeNull();
  });
});

describe("printing a base-unit amount", () => {
  it("groups an eighteen-decimal holding without routing it through a float", () => {
    // 12345.6789 of an 18-decimal coin. Number() on these base units lands on
    // 12345.678900000001.
    expect(groupBaseUnits(12345678900000000000000n, 18)).toBe("12,345.6789");
  });

  it("clamps the fraction to four digits and drops the trailing zeros", () => {
    expect(groupBaseUnits(1234567890n, 6)).toBe("1,234.5678");
    expect(groupBaseUnits(1500000n, 6)).toBe("1.5");
  });

  it("prints a whole amount with no decimal point at all", () => {
    expect(groupBaseUnits(4500000000000000000000000n, 18)).toBe("4,500,000");
    expect(groupBaseUnits(0n, 18)).toBe("0");
  });
});
