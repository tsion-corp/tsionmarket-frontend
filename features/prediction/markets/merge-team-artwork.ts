import type { ComboEvent, ComboTeam } from "./api";

function teamKey(name: string): string {
  return name.trim().toLocaleLowerCase();
}

export function mergeTeamArtwork(events: ComboEvent[], artwork: ComboTeam[]): ComboEvent[] {
  if (events.length === 0 || artwork.length === 0) return events;

  const artworkByName = new Map(artwork.map((team) => [teamKey(team.name), team]));

  return events.map((event) => ({
    ...event,
    teams: event.teams.map((team) => {
      const providerTeam = artworkByName.get(teamKey(team.name));
      if (!providerTeam) return team;

      return {
        ...team,
        ...providerTeam,
        ordering: team.ordering,
      };
    }),
  }));
}
