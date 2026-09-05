import type { SportsLeagueKey } from "./types";

const SPORTS_LEAGUE_TO_PROVIDER: Record<SportsLeagueKey, string | undefined> = {
  top: undefined,
  epl: "epl",
  laliga: "laliga",
  "serie-a": "serie-a",
  bundesliga: "bundesliga",
  "ligue-1": "ligue-1",
};

export function comboLeagueForNavigation(key: SportsLeagueKey): string | undefined {
  return SPORTS_LEAGUE_TO_PROVIDER[key];
}
