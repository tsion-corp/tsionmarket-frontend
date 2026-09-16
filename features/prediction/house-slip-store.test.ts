import { describe, expect, it } from "vitest";
import type { CategoryPrediction } from "./category-market-presenter";
import {
  canAddHouseSelection,
  isLowOddsSelection,
  lowOddsSelectionCount,
  type HouseSelection,
} from "./house-slip-store";

function selection(conditionId: string, odds: number): HouseSelection {
  const prediction: CategoryPrediction = {
    eventId: `event-${conditionId}`,
    eventTitle: "Event",
    marketId: `market-${conditionId}`,
    q: "Will it happen?",
    tag: "Test",
    vol: "$1K vol",
    yes: "50c",
    no: "50c",
    pct: 50,
    yesTokenId: `yes-${conditionId}`,
    noTokenId: `no-${conditionId}`,
    conditionId,
    tradable: true,
    yesDecimalOdds: odds,
    noDecimalOdds: 2,
  };
  return { prediction, side: "yes" };
}

describe("house accumulator low-odds limit", () => {
  it("counts the complete 1.01 through 1.08 range", () => {
    expect(isLowOddsSelection(selection("lower", 1.01))).toBe(true);
    expect(isLowOddsSelection(selection("upper", 1.08))).toBe(true);
    expect(isLowOddsSelection(selection("below", 1))).toBe(false);
    expect(lowOddsSelectionCount([selection("a", 1.01), selection("b", 1.08)])).toBe(2);
  });

  it("blocks a fourth low-odds selection", () => {
    const current = [selection("a", 1.01), selection("b", 1.04), selection("c", 1.08)];

    expect(canAddHouseSelection(current, selection("d", 1.06))).toBe(false);
    expect(canAddHouseSelection(current, selection("d", 1.7))).toBe(true);
  });

  it("allows changing one of the existing low-odds selections", () => {
    const current = [selection("a", 1.01), selection("b", 1.04), selection("c", 1.08)];

    expect(canAddHouseSelection(current, selection("c", 1.05))).toBe(true);
  });
});
