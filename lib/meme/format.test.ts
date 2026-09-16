import { describe, expect, it } from "vitest";
import {
  PLATFORM_FEE_SYMBOL,
  changeDirection,
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
