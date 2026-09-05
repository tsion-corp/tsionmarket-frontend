import { describe, expect, it } from "vitest";
import type { ComboEvent, ComboTeam } from "./api";
import { mergeTeamArtwork } from "./merge-team-artwork";

function eventWithTeam(team: ComboTeam): ComboEvent {
  return {
    id: "event-1",
    slug: "home-away",
    title: "Home vs Away",
    startTime: null,
    eventDate: null,
    live: false,
    volume: null,
    liquidity: null,
    league: { slug: "league", name: "League", imageUrl: null },
    teams: [team],
    moneyline: [],
    spreads: [],
    totals: [],
  };
}

describe("mergeTeamArtwork", () => {
  it("adds provider artwork without changing fixture ordering", () => {
    const eventTeam: ComboTeam = {
      id: null,
      name: "Pakhtakor",
      alias: null,
      abbreviation: null,
      record: null,
      logoUrl: null,
      color: null,
      ordering: "home",
    };
    const providerTeam: ComboTeam = {
      ...eventTeam,
      id: 42,
      abbreviation: "PAK",
      logoUrl: "https://example.com/pakhtakor.png",
      ordering: null,
    };

    const [merged] = mergeTeamArtwork([eventWithTeam(eventTeam)], [providerTeam]);

    expect(merged.teams[0]).toMatchObject({
      id: 42,
      abbreviation: "PAK",
      logoUrl: "https://example.com/pakhtakor.png",
      ordering: "home",
    });
  });

  it("matches team names without case sensitivity", () => {
    const eventTeam: ComboTeam = {
      id: null,
      name: "SK Brann Kvinner",
      alias: null,
      abbreviation: null,
      record: null,
      logoUrl: null,
      color: null,
      ordering: "away",
    };
    const providerTeam: ComboTeam = {
      ...eventTeam,
      name: "sk brann kvinner",
      logoUrl: "https://example.com/brann.png",
    };

    const [merged] = mergeTeamArtwork([eventWithTeam(eventTeam)], [providerTeam]);

    expect(merged.teams[0]?.logoUrl).toBe("https://example.com/brann.png");
  });
});
