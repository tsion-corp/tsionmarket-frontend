import { describe, expect, it } from "vitest";
import type { SlipSelection, SportsbookMarket } from "./api";
import { reconcileSlipSelections } from "./slip-reconciliation";

const selection: SlipSelection = {
  id: "old:29",
  eventId: "game-1",
  eventTitle: "Home - Away",
  eventKind: "sports",
  conditionId: "old",
  marketTitle: "Full Time Result",
  outcomeId: "29",
  outcomeTitle: "Home",
  odds: "1.50",
  expressForbidden: false,
};

function market(overrides: Partial<SportsbookMarket> = {}): SportsbookMarket {
  return {
    id: "new",
    eventId: "game-1",
    title: "Full Time Result",
    state: "active",
    providerState: "Active",
    marketId: 1,
    category: null,
    sortOrder: "50",
    expressForbidden: false,
    prematchEnabled: true,
    liveEnabled: true,
    hidden: false,
    outcomes: [
      {
        id: "29",
        title: "Home",
        odds: "1.06",
        point: null,
        state: "active",
        providerState: "Active",
        hidden: false,
        sortOrder: "1",
      },
    ],
    ...overrides,
  };
}

describe("reconcileSlipSelections", () => {
  it("rebinds a stopped prematch condition to its active live equivalent", () => {
    const result = reconcileSlipSelections([selection], [market()]);

    expect(result.unavailableSelectionIds).toEqual([]);
    expect(result.changed).toBe(true);
    expect(result.selections[0]).toMatchObject({
      id: "new:29",
      conditionId: "new",
      outcomeId: "29",
      odds: "1.06",
    });
  });

  it("updates odds on an existing active condition", () => {
    const result = reconcileSlipSelections([selection], [market({ id: "old" })]);

    expect(result.unavailableSelectionIds).toEqual([]);
    expect(result.selections[0]?.odds).toBe("1.06");
  });

  it("does not rebind to a disabled market", () => {
    const result = reconcileSlipSelections(
      [selection],
      [market({ prematchEnabled: false, liveEnabled: false })]
    );

    expect(result.changed).toBe(false);
    expect(result.unavailableSelectionIds).toEqual([selection.id]);
  });
});
