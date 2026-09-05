import type { ComboEvent, ComboLeague } from "./api";

function normalizeLeagueName(value: string): string {
  return value
    .toLocaleLowerCase()
    .replace(/\b20\d{2}\b/g, "")
    .replace(/\bprofessional\b/g, "pro")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function mergeLeagueArtwork(events: ComboEvent[], leagues: ComboLeague[]): ComboEvent[] {
  if (events.length === 0 || leagues.length === 0) return events;

  const leaguesBySlug = new Map<string, ComboLeague>();
  const leaguesByName = new Map<string, ComboLeague>();
  for (const league of leagues) {
    leaguesBySlug.set(league.slug.toLocaleLowerCase(), league);
    leaguesBySlug.set(league.providerSlug.toLocaleLowerCase(), league);
    leaguesByName.set(normalizeLeagueName(league.name), league);
  }

  return events.map((event) => {
    if (event.league.imageUrl) return event;

    const providerLeague =
      leaguesBySlug.get(event.league.slug.toLocaleLowerCase()) ??
      leaguesByName.get(normalizeLeagueName(event.league.name));
    if (!providerLeague?.imageUrl) return event;

    return {
      ...event,
      league: {
        ...event.league,
        imageUrl: providerLeague.imageUrl,
      },
    };
  });
}
