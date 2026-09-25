import { describe, expect, it } from "vitest";
import {
  entryPriceFromBaseUnits,
  entryPriceFromUsdString,
  oddsFromDecimalString,
  pnlPercentFromBaseUnits,
  pnlPercentFromPoints,
} from "@/lib/shine/money";

describe("entry price", () => {
  it("keeps every digit of a memecoin price past what a float holds", () => {
    // 0.00000420000000000001 at 20 decimals. As a double this is 4.2e-6 and
    // the last digit is gone before any formatting runs.
    expect(entryPriceFromBaseUnits(420_000_000_000_001n, 20)).toBe("$0.0000042");
    expect(entryPriceFromUsdString("0.0000042")).toBe("$0.0000042");
  });

  it("renders a normal price to cents", () => {
    expect(entryPriceFromBaseUnits(214_300_000n, 6)).toBe("$214.30");
    expect(entryPriceFromUsdString("64200")).toBe("$64,200.00");
  });

  it("refuses a price that is not a price, rather than printing $0", () => {
    expect(entryPriceFromBaseUnits(0n, 6)).toBeNull();
    expect(entryPriceFromBaseUnits(-1n, 6)).toBeNull();
    expect(entryPriceFromUsdString("")).toBeNull();
    expect(entryPriceFromUsdString("1e-6")).toBeNull();
    expect(entryPriceFromUsdString(null)).toBeNull();
    expect(entryPriceFromUsdString("-3")).toBeNull();
  });
});

describe("pnl percent", () => {
  it("computes a return from base units without a float", () => {
    expect(pnlPercentFromBaseUnits(100_000_000n, 145_000_000n)).toBe("+45%");
    expect(pnlPercentFromBaseUnits(145_000_000n, 100_000_000n)).toBe("-31.03%");
    expect(pnlPercentFromBaseUnits(100n, 100n)).toBe("0%");
  });

  it("stays exact past the range a double holds", () => {
    const entry = 10n ** 30n;
    expect(pnlPercentFromBaseUnits(entry, entry * 2n)).toBe("+100%");
  });

  it("refuses an entry of zero rather than inventing a return", () => {
    expect(pnlPercentFromBaseUnits(0n, 5n)).toBeNull();
    expect(pnlPercentFromBaseUnits(-5n, 5n)).toBeNull();
  });

  it("formats points the trade service already computed", () => {
    expect(pnlPercentFromPoints("45.2")).toBe("+45.2%");
    expect(pnlPercentFromPoints("-7.44")).toBe("-7.44%");
    expect(pnlPercentFromPoints("nonsense")).toBeNull();
    expect(pnlPercentFromPoints(undefined)).toBeNull();
  });
});

describe("odds", () => {
  it("renders decimal odds to two places", () => {
    expect(oddsFromDecimalString("2.1")).toBe("2.10");
    expect(oddsFromDecimalString("1")).toBeNull();
    expect(oddsFromDecimalString("0.5")).toBeNull();
    expect(oddsFromDecimalString("$2.10")).toBeNull();
  });
});
