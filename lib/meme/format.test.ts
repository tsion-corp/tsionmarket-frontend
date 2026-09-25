import { describe, expect, it } from "vitest";
import {
  PLATFORM_FEE_SYMBOL,
  changeDirection,
  compactCount,
  compactPercentPoints,
  compactUsd,
  formatUsdcAtomic,
  marketDataAge,
} from "@/lib/meme/format";

// The contract: null means "not currently available", never zero. A missing
// change is neither up nor down, and a real zero is a figure, not a blank.
describe("changeDirection", () => {
  it("is null for a change the service did not publish", () => {
    expect(changeDirection(null)).toBeNull();
    expect(changeDirection(undefined)).toBeNull();
  });

  it("is null for a value that is not a number", () => {
    expect(changeDirection("")).toBeNull();
    expect(changeDirection("n/a")).toBeNull();
  });

  it("follows the sign of a published change", () => {
    expect(changeDirection("12.5")).toBe("up");
    expect(changeDirection("-0.42")).toBe("down");
    expect(changeDirection("0")).toBe("up");
  });
});

describe("compactUsd", () => {
  it("renders a real zero as $0", () => {
    expect(compactUsd("0")).toBe("$0");
    expect(compactUsd("0.00")).toBe("$0");
  });

  it("renders only a missing or unreadable figure as a dash", () => {
    expect(compactUsd(null)).toBe("—");
    expect(compactUsd("")).toBe("—");
    expect(compactUsd("NaN")).toBe("—");
  });

  it("compacts a published figure", () => {
    expect(compactUsd("1887590")).toBe("$1.89M");
    expect(compactUsd("56699")).toBe("$56.7K");
  });

  // The figures that used to run out of their cells. cbBTC's market cap is
  // twenty-two characters written out and six compacted; the cap column is
  // 121px wide, so the long form pushed the row's last column off the panel.
  it("keeps a long figure inside its cell", () => {
    expect(compactUsd("3491589227.1234567890123")).toBe("$3.49B");
    expect(compactUsd("103240000000")).toBe("$103.24B");
    expect(compactUsd("1000000000000000")).toBe("$1,000T");
  });

  it("writes a figure under a thousand out in full", () => {
    expect(compactUsd("123.456")).toBe("$123.46");
    expect(compactUsd("999.994")).toBe("$999.99");
    expect(compactUsd("0.42")).toBe("$0.42");
  });

  // The bug this replaces: Number() plus Intl's compact notation rendered a
  // live price of 1.21495281918e-9 as "$0", which the contract forbids. A
  // figure below a cent is small, not absent and not zero.
  it("never shows a figure that is not zero as zero", () => {
    expect(compactUsd("0.004")).toBe("<$0.01");
    expect(compactUsd("1.21495281918e-9")).toBe("<$0.01");
    expect(compactUsd("0.01")).toBe("$0.01");
  });

  it("keeps the sign on a negative figure", () => {
    expect(compactUsd("-1887590")).toBe("-$1.89M");
    expect(compactUsd("-0.004")).toBe(">-$0.01");
  });

  // Rounding to the suffix is money arithmetic, so it runs on the digits the
  // service sent rather than on what a float can hold. Every digit here is
  // past the 17 a double keeps.
  it("rounds from the string, not from a float", () => {
    expect(compactUsd("1234567890123.456789")).toBe("$1.23T");
    expect(compactUsd("1885000")).toBe("$1.89M");
    expect(compactUsd("1884999.999")).toBe("$1.88M");
  });
});

describe("compactCount", () => {
  it("renders a missing count as a dash and a real zero as zero", () => {
    expect(compactCount(null)).toBe("—");
    expect(compactCount(undefined)).toBe("—");
    expect(compactCount(0)).toBe("0");
  });

  // A count means something to the unit, so it is grouped until it stops
  // fitting. "123,456" is no wider than the "123.46K" that would replace it.
  it("groups a count below a million", () => {
    expect(compactCount(842)).toBe("842");
    expect(compactCount(123456)).toBe("123,456");
    expect(compactCount(999999)).toBe("999,999");
  });

  // 1,284,339 transactions is nine characters in a 96px column.
  it("compacts a count from a million up", () => {
    expect(compactCount(1284339)).toBe("1.28M");
    expect(compactCount(1000000)).toBe("1M");
    expect(compactCount(2400000000)).toBe("2.4B");
  });
});

// Changes arrive as points ("12.5" is +12.5%), so nothing here converts them.
describe("compactPercentPoints", () => {
  it("is null for a change the service did not publish", () => {
    expect(compactPercentPoints(null)).toBeNull();
    expect(compactPercentPoints("")).toBeNull();
    expect(compactPercentPoints("n/a")).toBeNull();
  });

  it("keeps both decimals and an explicit sign for an ordinary move", () => {
    expect(compactPercentPoints("12.5")).toBe("+12.50%");
    expect(compactPercentPoints("-4.2")).toBe("-4.20%");
    expect(compactPercentPoints("0")).toBe("+0.00%");
    expect(compactPercentPoints("999.994")).toBe("+999.99%");
  });

  // A card 156px wide cannot draw "+12345.67%" at 18px, which is what a fresh
  // launch's first hour looks like.
  it("compacts a move past a thousand points", () => {
    expect(compactPercentPoints("12345.67")).toBe("+12.35K%");
    expect(compactPercentPoints("-45000")).toBe("-45K%");
    expect(compactPercentPoints("2400000")).toBe("+2.4M%");
  });
});

// The platform fee settles in USDC on both chains, and a Solana quote states it
// in USDC base units. Read as a bigint, never through a float: a fee string is
// money, and the conversion must not lose a base unit however long it runs.
describe("formatUsdcAtomic", () => {
  it("reads USDC base units at six decimals", () => {
    expect(formatUsdcAtomic("2500")).toBe("0.0025");
    expect(formatUsdcAtomic("1250000")).toBe("1.25");
    expect(formatUsdcAtomic("0")).toBe("0");
  });

  it("keeps every digit of an amount past 2^53 base units", () => {
    expect(formatUsdcAtomic("123456789012345678901")).toBe("123456789012345.678901");
  });

  it("refuses anything that is not a whole number of base units", () => {
    expect(formatUsdcAtomic("12.5")).toBeNull();
    expect(formatUsdcAtomic("")).toBeNull();
    expect(formatUsdcAtomic("-5")).toBeNull();
    expect(formatUsdcAtomic("1e6")).toBeNull();
  });

  it("names USDC as the fee currency on both chains", () => {
    expect(PLATFORM_FEE_SYMBOL).toBe("USDC");
  });
});

// A position's mark is only as good as its age. The contract says to show
// marketDataUpdatedAt or use it to label stale prices; past fifteen minutes
// the mark is labelled stale, and a missing timestamp is "no market data".
describe("marketDataAge", () => {
  const NOW = Date.parse("2026-09-14T15:30:00.000Z");
  const minutesAgo = (m: number) => new Date(NOW - m * 60_000).toISOString();

  it("is none when the service has no market data timestamp", () => {
    expect(marketDataAge(null, NOW)).toEqual({ kind: "none" });
    expect(marketDataAge("not a date", NOW)).toEqual({ kind: "none" });
  });

  it("is fresh with its age in whole minutes up to fifteen", () => {
    expect(marketDataAge(minutesAgo(5), NOW)).toEqual({ kind: "fresh", minutes: 5 });
    expect(marketDataAge(minutesAgo(15), NOW)).toEqual({ kind: "fresh", minutes: 15 });
  });

  it("is stale past fifteen minutes", () => {
    expect(marketDataAge(minutesAgo(16), NOW)).toEqual({ kind: "stale", minutes: 16 });
  });

  it("never reports a negative age for a clock slightly ahead", () => {
    expect(marketDataAge(minutesAgo(-1), NOW)).toEqual({ kind: "fresh", minutes: 0 });
  });
});
