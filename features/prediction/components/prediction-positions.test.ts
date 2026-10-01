import { describe, expect, it } from "vitest";
import { shouldShowPolymarketPositions } from "./prediction-positions";

describe("shouldShowPolymarketPositions", () => {
  it("keeps the lazy load action visible before balances are checked", () => {
    expect(
      shouldShowPolymarketPositions({
        positions: [],
        available: null,
        cashable: null,
        loaded: false,
      })
    ).toBe(true);
  });

  it("hides an account with no Polymarket balance or positions", () => {
    expect(
      shouldShowPolymarketPositions({
        positions: [],
        available: 0,
        cashable: 0,
        loaded: true,
      })
    ).toBe(false);
  });

  it("stays visible for a funded account or an open position", () => {
    expect(
      shouldShowPolymarketPositions({
        positions: [],
        available: 1,
        cashable: 1,
        loaded: true,
      })
    ).toBe(true);
    expect(
      shouldShowPolymarketPositions({
        positions: [{}] as never[],
        available: 0,
        cashable: 0,
        loaded: true,
      })
    ).toBe(true);
  });
});
