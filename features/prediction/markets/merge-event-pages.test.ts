import { describe, expect, it } from "vitest";
import type { ComboEvent, ComboEventsPage, ComboMarket } from "./api";
import { mergeComboEventPages } from "./merge-event-pages";

function market(id: string, marketType: ComboMarket["marketType"]): ComboMarket {
  return {
    id,
    conditionId: `condition-${id}`,
    slug: id,
    question: id,
    label: null,
    marketType,
    line: marketType === "total" ? 2.5 : null,
    positionIds: [],
    selections: [],
    volume: null,
    liquidity: null,
  };
}

function event(markets: Partial<Pick<ComboEvent, "moneyline" | "spreads" | "totals">>): ComboEvent {
  return {
    id: "fixture-1",
    slug: "fixture-1",
    title: "Home vs. Away",
    startTime: "2026-08-25T20:00:00Z",
    eventDate: "2026-08-25",
    live: false,
    volume: null,
    liquidity: null,
    league: { slug: "epl", name: "Premier League", imageUrl: null },
    teams: [],
    moneyline: markets.moneyline ?? [],
    spreads: markets.spreads ?? [],
    totals: markets.totals ?? [],
  };
}

function page(events: ComboEvent[]): ComboEventsPage {
  return { sport: "soccer", league: null, events, nextCursor: null };
}

describe("mergeComboEventPages", () => {
  it("combines a fixture split across market-offset pages", () => {
    const result = mergeComboEventPages([
      page([event({ moneyline: [market("moneyline", "moneyline")] })]),
      page([event({ totals: [market("total", "total")] })]),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]?.moneyline.map((item) => item.id)).toEqual(["moneyline"]);
    expect(result[0]?.totals.map((item) => item.id)).toEqual(["total"]);
  });
});
