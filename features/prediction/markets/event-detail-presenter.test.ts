import { describe, expect, it } from "vitest";
import type { ComboEvent, ComboMarket } from "./api";
import { eventMarketGroups } from "./event-detail-presenter";

function market(
  id: string,
  label: string,
  marketType: ComboMarket["marketType"],
  outcomes: Array<[string, number | null, boolean?]>,
  line: number | null = null
): ComboMarket {
  return {
    id,
    conditionId: `condition-${id}`,
    slug: id,
    question: label,
    label,
    marketType,
    line,
    positionIds: [],
    volume: 10,
    liquidity: 20,
    selections: outcomes.map(([outcome, decimalOdds, executable = true], outcomeIndex) => ({
      outcome,
      outcomeIndex,
      tokenId: decimalOdds == null || !executable ? null : `token-${id}-${outcomeIndex}`,
      positionId: decimalOdds == null || !executable ? null : `position-${id}-${outcomeIndex}`,
      referencePrice: decimalOdds == null ? null : 1 / decimalOdds,
      decimalOdds,
    })),
  };
}

function event(): ComboEvent {
  return {
    id: "72221220",
    slug: "arsenal-chelsea",
    title: "Arsenal vs Chelsea",
    startTime: "2026-08-28T19:00:00Z",
    eventDate: "2026-08-28",
    live: false,
    volume: 100,
    liquidity: 200,
    league: { slug: "epl", name: "Premier League", imageUrl: null },
    teams: [],
    moneyline: [
      market("arsenal", "Arsenal", "moneyline", [["Yes", 1.8]]),
      market("draw", "Draw", "moneyline", [["Yes", 3.4]]),
      market("chelsea", "Chelsea", "moneyline", [["Yes", 4.2]]),
    ],
    totals: [
      market(
        "total-2.5",
        "O/U 2.5",
        "total",
        [
          ["Over", 1.9],
          ["Under", 1.95],
        ],
        2.5
      ),
    ],
    spreads: [
      market(
        "spread",
        "Arsenal -1.5",
        "spread",
        [
          ["Arsenal", 2.2],
          ["Chelsea", 1.7, false],
        ],
        -1.5
      ),
    ],
  };
}

describe("prediction event detail presenter", () => {
  it("groups the provider markets without inventing unsupported sections", () => {
    const groups = eventMarketGroups(event());

    expect(groups.map(({ key, title }) => ({ key, title }))).toEqual([
      { key: "moneyline", title: "Moneyline" },
      { key: "total", title: "Goals" },
      { key: "spread", title: "Spread" },
    ]);
    expect(groups[0].cards[0].outcomes.map(({ selection }) => selection.label)).toEqual([
      "Arsenal",
      "Draw",
      "Chelsea",
    ]);
    expect(groups[1].cards[0]).toMatchObject({ title: "Total goals", line: 2.5 });
    expect(
      groups[2].cards[0].outcomes.map(({ selection, executable }) => ({
        label: selection.label,
        executable,
      }))
    ).toEqual([
      { label: "Arsenal", executable: true },
      { label: "Chelsea", executable: false },
    ]);
  });

  it("drops empty market groups", () => {
    const groups = eventMarketGroups({ ...event(), totals: [], spreads: [] });
    expect(groups.map(({ key }) => key)).toEqual(["moneyline"]);
  });
});
