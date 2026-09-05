import { describe, expect, it } from "vitest";
import type { MarketOutcome, SportsbookMarket } from "./api";
import {
  chunkMarketOutcomes,
  filterEventMarketGroups,
  groupEventMarkets,
  outcomeTitle,
} from "./event-market-groups";

function outcome(id: string, title: string, odds = "2.00", point: string | null = null) {
  return {
    id,
    title,
    odds,
    point,
    state: "active",
    providerState: "Active",
    hidden: false,
    sortOrder: null,
  } satisfies MarketOutcome;
}

function market(
  id: string,
  title: string,
  outcomes: MarketOutcome[],
  state: SportsbookMarket["state"] = "active"
) {
  return {
    id,
    eventId: "game-1",
    title,
    state,
    providerState: state === "active" ? "Active" : "Stopped",
    marketId: 1,
    category: null,
    sortOrder: null,
    expressForbidden: false,
    prematchEnabled: true,
    liveEnabled: true,
    hidden: false,
    outcomes,
  } satisfies SportsbookMarket;
}

describe("event market grouping", () => {
  it("groups conditions by market title and keeps the stronger duplicate", () => {
    const stopped = market(
      "stopped",
      "Total Goals",
      [outcome("a", "Over", "1.80", "2.5"), outcome("b", "Under", "1.90", "2.5")],
      "stopped"
    );
    const active = market("active", " total  goals ", [
      outcome("c", "Under", "1.95", "2.5"),
      outcome("d", "Over", "1.85", "2.5"),
    ]);

    const groups = groupEventMarkets([stopped, active]);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.markets.map(({ id }) => id)).toEqual(["active"]);
  });

  it("searches both market and outcome labels", () => {
    const groups = groupEventMarkets([
      market("one", "Full Time Result", [outcome("a", "Home"), outcome("b", "Away")]),
      market("two", "Correct Score", [outcome("c", "2-1"), outcome("d", "1-2")]),
    ]);

    expect(filterEventMarketGroups(groups, "full").map(({ title }) => title)).toEqual([
      "Full Time Result",
    ]);
    expect(filterEventMarketGroups(groups, "2-1").map(({ title }) => title)).toEqual([
      "Correct Score",
    ]);
  });

  it("chunks long outcome lists into balanced rows", () => {
    const six = market(
      "six",
      "Combination",
      Array.from({ length: 6 }, (_, index) => outcome(String(index), String(index)))
    );
    const eight = market(
      "eight",
      "Score",
      Array.from({ length: 8 }, (_, index) => outcome(String(index), String(index)))
    );

    expect(chunkMarketOutcomes(six).map((row) => row.length)).toEqual([2, 2, 2]);
    expect(chunkMarketOutcomes(eight).map((row) => row.length)).toEqual([4, 4]);
  });

  it("only appends a point when the provider label does not already contain it", () => {
    expect(outcomeTitle(outcome("one", "Over", "2.00", "2.5"))).toBe("Over 2.5");
    expect(outcomeTitle(outcome("two", "Over (2.5)", "2.00", "2.5"))).toBe("Over (2.5)");
  });
});
