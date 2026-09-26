import { describe, expect, it } from "vitest";
import { moneyInputToUsd, moneyInputValue, type Currency } from "@/lib/currencies";

const usd = { code: "USD", symbol: "$" } as Currency;
const ngn = { code: "NGN", symbol: "₦" } as Currency;
const jpy = { code: "JPY", symbol: "¥" } as Currency;

describe("the figure put into an editable field", () => {
  it("carries no symbol and no grouping, so there is nothing to delete first", () => {
    expect(moneyInputValue(1234.5, usd, 1)).toBe("1234.50");
  });

  it("is in the currency the player is reading", () => {
    expect(moneyInputValue(1, jpy, 150)).toBe("150.00");
  });

  // NGN is one of the currencies this app shows whole.
  it("drops the decimals a currency does not show", () => {
    expect(moneyInputValue(1, ngn, 1600)).toBe("1600");
  });

  it("is empty without a rate, rather than a figure at the wrong scale", () => {
    expect(moneyInputValue(1, ngn, 0)).toBe("");
  });
});

describe("what a player typed, back in USD", () => {
  it("reads a plain figure", () => {
    expect(moneyInputToUsd("0.76", usd, 1)).toBe(0.76);
  });

  it("converts back through the rate it was shown at", () => {
    expect(moneyInputToUsd("1600", ngn, 1600)).toBe(1);
  });

  it("takes a pasted figure with its symbol and separators", () => {
    expect(moneyInputToUsd("$1,234.50", usd, 1)).toBe(1234.5);
  });

  // Null is "leave the stake alone". Zero would be a stake the contract
  // rejects, and a half-typed figure is not an instruction.
  it.each(["", " ", ".", "abc", "-5", "0", "1.2.3"])("refuses %o", (text) => {
    expect(moneyInputToUsd(text, usd, 1)).toBeNull();
  });
});
