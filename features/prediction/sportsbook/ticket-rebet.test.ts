import { describe, expect, it } from "vitest";
import type { SportsbookOrder } from "./api";
import { canRebet, selectionsFromOrder } from "./ticket-rebet";

const legs: SportsbookOrder["legs"] = [
  {
    eventId: "event-2",
    eventTitle: "C v D",
    eventKind: "sports",
    conditionId: "condition-2",
    marketTitle: "Winner",
    outcomeId: "outcome-2",
    outcomeTitle: "D",
    requestedOdds: "2.10",
    acceptedOdds: "2.05",
    result: null,
    index: 1,
  },
  {
    eventId: "event-1",
    eventTitle: "A v B",
    eventKind: "sports",
    conditionId: "condition-1",
    marketTitle: "Winner",
    outcomeId: "outcome-1",
    outcomeTitle: "A",
    requestedOdds: "1.90",
    acceptedOdds: null,
    result: null,
    index: 0,
  },
];

describe("sportsbook ticket rebet", () => {
  it("rebuilds the slip in ticket order with the latest recorded odds", () => {
    const selections = selectionsFromOrder({ legs });

    expect(selections.map(({ id }) => id)).toEqual([
      "condition-1:outcome-1",
      "condition-2:outcome-2",
    ]);
    expect(selections.map(({ odds }) => odds)).toEqual(["1.90", "2.05"]);
  });

  it("offers rebet only when placement did not complete", () => {
    expect(canRebet("rejected")).toBe(true);
    expect(canRebet("failed")).toBe(true);
    expect(canRebet("canceled")).toBe(true);
    expect(canRebet("accepted")).toBe(false);
    expect(canRebet("lost")).toBe(false);
  });
});
