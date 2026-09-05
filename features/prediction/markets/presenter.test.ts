import { describe, expect, it } from "vitest";
import type { ComboEvent, ComboMarket } from "./api";
import { filterEventsByWindow, groupLeagueFixtures, toFixtureBoardRow } from "./presenter";

function market(
  id: string,
  label: string,
  type: ComboMarket["marketType"],
  outcomes: Array<[string, number]>,
  line: number | null = null
): ComboMarket {
  return {
    id,
    conditionId: `condition-${id}`,
    slug: id,
    question: label,
    label,
    marketType: type,
    line,
    positionIds: [],
    volume: 10,
    liquidity: 20,
    selections: outcomes.map(([outcome, decimalOdds], outcomeIndex) => ({
      outcome,
      outcomeIndex,
      tokenId: `token-${id}-${outcomeIndex}`,
      positionId: `position-${id}-${outcomeIndex}`,
      referencePrice: 1 / decimalOdds,
      decimalOdds,
    })),
  };
}

function event(overrides: Partial<ComboEvent> = {}): ComboEvent {
  return {
    id: "event-1",
    slug: "arsenal-chelsea",
    title: "Arsenal vs Chelsea",
    startTime: "2026-08-28T19:00:00Z",
    eventDate: "2026-08-28",
    live: false,
    volume: 100,
    liquidity: 200,
    league: { slug: "epl", name: "Premier League", imageUrl: null },
    teams: [
      {
        id: 1,
        name: "Arsenal",
        alias: null,
        abbreviation: "ARS",
        record: null,
        logoUrl: "https://example.com/arsenal.png",
        color: "#ef0107",
        ordering: "home",
      },
      {
        id: 2,
        name: "Chelsea",
        alias: null,
        abbreviation: "CHE",
        record: null,
        logoUrl: "https://example.com/chelsea.png",
        color: "#034694",
        ordering: "away",
      },
    ],
    moneyline: [
      market("arsenal", "Arsenal", "moneyline", [["Yes", 1.8]]),
      { ...market("draw", "Draw", "moneyline", [["Yes", 3.4]]), slug: "event-draw" },
      market("chelsea", "Chelsea", "moneyline", [["Yes", 4.2]]),
    ],
    spreads: [],
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
      market(
        "total-3.5",
        "O/U 3.5",
        "total",
        [
          ["Over", 2.4],
          ["Under", 1.55],
        ],
        3.5
      ),
    ],
    ...overrides,
  };
}

describe("prediction sports presenter", () => {
  it("builds the five primary football selections", () => {
    const row = toFixtureBoardRow(event());
    expect(row.home?.decimalOdds).toBe(1.8);
    expect(row.draw?.decimalOdds).toBe(3.4);
    expect(row.away?.decimalOdds).toBe(4.2);
    expect(row.totalOptions.map(({ line }) => line)).toEqual([2.5, 3.5]);
    expect(row.totalOptions[0].over?.decimalOdds).toBe(1.9);
    expect(row.totalOptions[0].under?.decimalOdds).toBe(1.95);
    expect(row.defaultTotalId).toBe("total-2.5");
    expect(row.homeLogoUrl).toBe("https://example.com/arsenal.png");
    expect(row.awayLogoUrl).toBe("https://example.com/chelsea.png");
    expect(row.homeColor).toBe("#ef0107");
    expect(row.awayColor).toBe("#034694");
  });

  it("groups fixtures by league and orders them by kickoff", () => {
    const later = event({ id: "later", startTime: "2026-08-29T19:00:00Z" });
    const earlier = event({ id: "earlier", startTime: "2026-08-27T19:00:00Z" });
    const groups = groupLeagueFixtures([later, earlier]);
    expect(groups).toHaveLength(1);
    expect(groups[0].fixtures.map((fixture) => fixture.id)).toEqual(["earlier", "later"]);
  });

  it("keeps live and same-day fixtures in Today", () => {
    const now = new Date("2026-08-28T12:00:00Z");
    const today = event();
    const live = event({ id: "live", startTime: "2026-08-27T19:00:00Z", live: true });
    const later = event({ id: "later", startTime: "2026-08-29T19:00:00Z" });
    expect(filterEventsByWindow([today, live, later], "today", now).map(({ id }) => id)).toEqual([
      "event-1",
      "live",
    ]);
  });

  it("keeps Today out of Upcoming and orders the remaining fixtures by kickoff", () => {
    const now = new Date("2026-08-28T12:00:00Z");
    const today = event();
    const live = event({ id: "live", startTime: "2026-08-27T19:00:00Z", live: true });
    const later = event({ id: "later", startTime: "2026-09-23T19:00:00Z" });
    const nearer = event({ id: "nearer", startTime: "2026-09-04T19:00:00Z" });
    const upcoming = filterEventsByWindow([today, live, later, nearer], "upcoming", now);
    const groups = groupLeagueFixtures(upcoming);

    expect(groups[0].fixtures.map((fixture) => fixture.id)).toEqual(["nearer", "later"]);
  });

  it("keeps only future fixtures within the next rolling 24 hours", () => {
    const now = new Date("2026-08-28T12:00:00Z");
    const live = event({ id: "live", startTime: "2026-08-28T11:30:00Z", live: true });
    const soon = event({ id: "soon", startTime: "2026-08-29T11:59:00Z" });
    const boundary = event({ id: "boundary", startTime: "2026-08-29T12:00:00Z" });
    const later = event({ id: "later", startTime: "2026-08-29T12:01:00Z" });

    expect(
      filterEventsByWindow([live, soon, boundary, later], "next-24h", now).map(({ id }) => id)
    ).toEqual(["soon", "boundary"]);
  });
});
