import { describe, expect, it } from "vitest";
import { formatPercentPoints, formatQuantity, formatUsdString, signOf } from "@/lib/meme/decimal";

// The portfolio contract sends every quantity, USD amount, price and percentage
// as a decimal string, and asks for a decimal library rather than binary
// floats. These helpers do what the screen needs (sign, round, group) through
// bigint at 18 decimal places, so a figure past 2^53 keeps every digit and a
// null stays a null for the caller to call "unavailable".

describe("signOf", () => {
  it("follows the sign of the string, not of a float", () => {
    expect(signOf("32")).toBe(1);
    expect(signOf("-0.5")).toBe(-1);
    expect(signOf("0")).toBe(0);
    expect(signOf("-0.000")).toBe(0);
    expect(signOf("+4")).toBe(1);
  });

  it("is null for a figure the service did not publish or that is not a plain decimal", () => {
    expect(signOf(null)).toBeNull();
    expect(signOf(undefined)).toBeNull();
    expect(signOf("")).toBeNull();
    expect(signOf("1e5")).toBeNull();
    expect(signOf("n/a")).toBeNull();
  });

  it("holds past 2^53 and down to 18 places", () => {
    expect(signOf("-123456789012345678901234567890.000000000000000001")).toBe(-1);
    expect(signOf("0.000000000000000001")).toBe(1);
  });
});

describe("formatPercentPoints", () => {
  it("reads percentage points as they are sent: 32 is +32%, not 0.32%", () => {
    expect(formatPercentPoints("32")).toBe("+32%");
    expect(formatPercentPoints("0.32")).toBe("+0.32%");
  });

  it("keeps the minus sign and never adds a plus to zero", () => {
    expect(formatPercentPoints("-0.5")).toBe("-0.5%");
    expect(formatPercentPoints("0")).toBe("0%");
  });

  it("rounds to two places, half away from zero", () => {
    expect(formatPercentPoints("12.345")).toBe("+12.35%");
    expect(formatPercentPoints("-12.345")).toBe("-12.35%");
    expect(formatPercentPoints("7.10")).toBe("+7.1%");
  });

  it("keeps every digit past 2^53", () => {
    expect(formatPercentPoints("123456789012345678")).toBe("+123,456,789,012,345,678%");
  });

  it("is null for a null return, never -100%", () => {
    expect(formatPercentPoints(null)).toBeNull();
  });
});

describe("formatUsdString", () => {
  it("prints cents for a dollar and up, with grouping", () => {
    expect(formatUsdString("1234.5")).toBe("$1,234.50");
    expect(formatUsdString("5")).toBe("$5.00");
    expect(formatUsdString("0")).toBe("$0.00");
  });

  it("puts the sign before the symbol and gains + only when asked", () => {
    expect(formatUsdString("-12.3")).toBe("-$12.30");
    expect(formatUsdString("12.3", { signed: true })).toBe("+$12.30");
    expect(formatUsdString("-12.3", { signed: true })).toBe("-$12.30");
    expect(formatUsdString("12.3")).toBe("$12.30");
    expect(formatUsdString("0", { signed: true })).toBe("$0.00");
  });

  // A memecoin price routinely sits far below a cent. Fixed decimal places
  // printed "0.0000012345" as "$0.000001", and a smaller one as "$0.00".
  it("keeps four significant digits below a dollar, never collapsing a price toward $0", () => {
    expect(formatUsdString("0.0000012345")).toBe("$0.000001235");
    expect(formatUsdString("0.00000000004321")).toBe("$0.00000000004321");
    expect(formatUsdString("0.01234")).toBe("$0.01234");
    expect(formatUsdString("0.5")).toBe("$0.50");
  });

  it("is null for a null valuation or an unreadable figure, never $0", () => {
    expect(formatUsdString(null)).toBeNull();
    expect(formatUsdString("NaN")).toBeNull();
  });

  it("keeps every digit of a figure past 2^53", () => {
    expect(formatUsdString("90071992547409931234.56")).toBe("$90,071,992,547,409,931,234.56");
  });
});

describe("formatQuantity", () => {
  it("groups a whole-coin balance and keeps up to four places", () => {
    expect(formatQuantity("142244.119999")).toBe("142,244.12");
    expect(formatQuantity("1.23456789")).toBe("1.2346");
    expect(formatQuantity("1500")).toBe("1,500");
    expect(formatQuantity("4")).toBe("4");
  });

  it("keeps a whole-token count past 2^53 exact", () => {
    expect(formatQuantity("123456789012345678901234")).toBe("123,456,789,012,345,678,901,234");
  });

  it("shows a fraction of a coin by its significant digits, not as 0", () => {
    expect(formatQuantity("0.000012345")).toBe("0.00001235");
    expect(formatQuantity("0")).toBe("0");
  });

  it("keeps a negative delta's minus, and is null for an unreadable quantity", () => {
    expect(formatQuantity("-3")).toBe("-3");
    expect(formatQuantity(null)).toBeNull();
    expect(formatQuantity("abc")).toBeNull();
  });
});
