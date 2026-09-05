import { describe, expect, it } from "vitest";
import type { ComboEvent, ComboLeague } from "./api";
import { mergeLeagueArtwork } from "./merge-league-artwork";

function eventWithLeague(slug: string, name: string): ComboEvent {
  return {
    id: `event-${slug}`,
    slug: `event-${slug}`,
    title: "Home vs Away",
    startTime: null,
    eventDate: null,
    live: false,
    volume: null,
    liquidity: null,
    league: { slug, name, imageUrl: null },
    teams: [],
    moneyline: [],
    spreads: [],
    totals: [],
  };
}

const leagues: ComboLeague[] = [
  {
    slug: "efl",
    providerSlug: "efl",
    name: "EFL CUP",
    imageUrl: "https://example.com/efl.png",
    seriesId: "10230",
    primaryTagId: 102595,
    teamOrdering: "home",
  },
  {
    slug: "spl",
    providerSlug: "spl",
    name: "Saudi Pro League",
    imageUrl: "https://example.com/spl.png",
    seriesId: "10361",
    primaryTagId: 102650,
    teamOrdering: "home",
  },
  {
    slug: "ucl",
    providerSlug: "ucl",
    name: "UEFA Champions League",
    imageUrl: "https://example.com/ucl.png",
    seriesId: "10204",
    primaryTagId: 1234,
    teamOrdering: "home",
  },
];

describe("mergeLeagueArtwork", () => {
  it("matches provider league slugs", () => {
    const [event] = mergeLeagueArtwork([eventWithLeague("efl", "EFL Cup")], leagues);

    expect(event.league.imageUrl).toBe("https://example.com/efl.png");
  });

  it("normalizes provider naming and season suffixes", () => {
    const events = mergeLeagueArtwork(
      [
        eventWithLeague("saudi-professional-league", "Saudi Professional League"),
        eventWithLeague("champions-league-2025", "UEFA Champions League 2025"),
      ],
      leagues
    );

    expect(events.map((event) => event.league.imageUrl)).toEqual([
      "https://example.com/spl.png",
      "https://example.com/ucl.png",
    ]);
  });
});
