import { describe, expect, it } from "vitest";
import { WHAT_IF_STAKE_USD, whatIfValue } from "@/lib/meme/what-if";

// "$100 then is $112.34 now". The line is a money figure, so it is worked out
// on the decimal strings with bigint, never through a float: a float would
// turn 100 * 1.1234 into 112.33999999999999.

describe("whatIfValue", () => {
  it("applies the change to the stake, to the cent", () => {
    expect(WHAT_IF_STAKE_USD).toBe("100");
    expect(whatIfValue("100", "12.34")).toBe("112.34");
    expect(whatIfValue("100", "0")).toBe("100.00");
    expect(whatIfValue("100", "-4.5")).toBe("95.50");
    expect(whatIfValue("100", "250")).toBe("350.00");
    expect(whatIfValue("250.5", "10")).toBe("275.55");
  });

  it("reads float artifacts and long fractions exactly", () => {
    expect(whatIfValue("100", "12.340000000000002")).toBe("112.34");
    expect(whatIfValue("100", "-12.339999999999998")).toBe("87.66");
    expect(whatIfValue("100", "1.2e-7")).toBe("100.00");
    expect(whatIfValue("100", "1.5e2")).toBe("250.00");
  });

  it("rounds half up to two places", () => {
    expect(whatIfValue("100", "0.005")).toBe("100.01");
    expect(whatIfValue("100", "0.00499999999999999999")).toBe("100.00");
    expect(whatIfValue("1", "0.5")).toBe("1.01");
    expect(whatIfValue("100", "-0.005")).toBe("100.00");
    expect(whatIfValue("100", "-99.995")).toBe("0.01");
  });

  it("never goes below zero", () => {
    expect(whatIfValue("100", "-100")).toBe("0.00");
    expect(whatIfValue("100", "-99.996")).toBe("0.00");
    expect(whatIfValue("100", "-250")).toBe("0.00");
  });

  it("keeps every digit of a large figure", () => {
    expect(whatIfValue("100", "123456789012345678901234567890")).toBe(
      "123456789012345678901234567990.00"
    );
  });

  it("is null when there is no change to apply", () => {
    expect(whatIfValue("100", null)).toBeNull();
    expect(whatIfValue("100", "")).toBeNull();
    expect(whatIfValue("100", "twelve")).toBeNull();
    expect(whatIfValue("100", "1.2.3")).toBeNull();
  });

  it("is null for a stake that is not a non-negative decimal", () => {
    expect(whatIfValue("", "5")).toBeNull();
    expect(whatIfValue("-100", "5")).toBeNull();
    expect(whatIfValue("abc", "5")).toBeNull();
  });
});
