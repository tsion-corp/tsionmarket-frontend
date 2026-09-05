import { describe, expect, it } from "vitest";
import {
  MAX_SINGLE_SELECTIONS,
  MAX_SLIP_SELECTIONS,
  comboAvailable,
  combinedReferenceOddsE6,
  formatUsdE6,
  parseUsdE6,
  referenceReturnE6,
  resolveBetSlipMode,
  summedReferenceOddsE6,
  toggleSlipSelection,
  totalStakeE6,
  type MarketSlipSelection,
} from "./bet-slip";

function selection(overrides: Partial<MarketSlipSelection> = {}): MarketSlipSelection {
  return {
    id: "market-1:yes",
    source: "sports",
    eventId: "event-1",
    eventTitle: "Arsenal vs Chelsea",
    marketId: "market-1",
    conditionId: "condition-1",
    positionId: "1001",
    tokenId: "2001",
    marketLabel: "Arsenal",
    outcome: "Yes",
    decimalOdds: 2,
    ...overrides,
  };
}

describe("prediction market bet slip", () => {
  it("toggles a selection and replaces an opposing outcome from the same market", () => {
    const first = selection();
    expect(toggleSlipSelection([first], first)).toEqual([]);

    const opposite = selection({ id: "market-1:no", outcome: "No", tokenId: "2002" });
    expect(toggleSlipSelection([first], opposite)).toEqual([opposite]);
  });

  it("only enables Combo mode for multiple executable sports legs", () => {
    const sports = [selection(), selection({ id: "market-2:yes", conditionId: "condition-2" })];
    expect(comboAvailable(sports)).toBe(true);
    expect(resolveBetSlipMode(sports, "combo")).toBe("combo");

    const mixed = [sports[0], selection({ source: "discovery", positionId: null })];
    expect(comboAvailable(mixed)).toBe(false);
    expect(resolveBetSlipMode(mixed, "combo")).toBe("singles");
  });

  it("limits the active singles slip to the 15-order batch maximum", () => {
    const selections = Array.from({ length: MAX_SINGLE_SELECTIONS }, (_, index) =>
      selection({
        id: `market-${index}:yes`,
        marketId: `market-${index}`,
        conditionId: `condition-${index}`,
        positionId: `${1000 + index}`,
      })
    );

    expect(
      toggleSlipSelection(
        selections,
        selection({ id: "market-16:yes", marketId: "market-16", conditionId: "condition-16" })
      )
    ).toHaveLength(MAX_SINGLE_SELECTIONS);
  });

  it("keeps the documented 50-leg Combo eligibility contract for future reactivation", () => {
    const selections = Array.from({ length: MAX_SLIP_SELECTIONS }, (_, index) =>
      selection({
        id: `market-${index}:yes`,
        marketId: `market-${index}`,
        conditionId: `condition-${index}`,
        positionId: `${1000 + index}`,
      })
    );

    expect(comboAvailable(selections)).toBe(true);
  });

  it("calculates Combo and singles totals in six-decimal base units", () => {
    const selections = [
      selection(),
      selection({ id: "market-2:yes", conditionId: "condition-2", decimalOdds: 3 }),
    ];
    const stake = parseUsdE6("1.25");
    expect(stake).toBe(1_250_000n);
    expect(combinedReferenceOddsE6(selections)).toBe(6_000_000n);
    expect(summedReferenceOddsE6(selections)).toBe(5_000_000n);
    expect(totalStakeE6(selections, stake!, "combo")).toBe(1_250_000n);
    expect(totalStakeE6(selections, stake!, "singles")).toBe(2_500_000n);
    expect(referenceReturnE6(selections, stake!, "combo")).toBe(7_500_000n);
    expect(referenceReturnE6(selections, stake!, "singles")).toBe(6_250_000n);
    expect(formatUsdE6(7_500_000n)).toBe("$7.50");
  });

  it("rejects invalid, zero, and over-precision stakes", () => {
    expect(parseUsdE6("0")).toBeNull();
    expect(parseUsdE6("1.0000001")).toBeNull();
    expect(parseUsdE6("abc")).toBeNull();
  });
});
