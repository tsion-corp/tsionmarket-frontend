import type {
  ComboEvent,
  ComboEventsPage,
  ComboEventsParams,
  ComboFilters,
  ComboSport,
  ComboTeam,
  DiscoveryEventsPage,
  DiscoveryEventsParams,
  DiscoveryMarketEvent,
  NormalSport,
  SportsEvent,
  SportsEventsPage,
  SportsEventsParams,
  SportsFilters,
} from "./types";
import { predictionCombos } from "./service";

export function fetchComboFilters(sport: ComboSport): Promise<ComboFilters> {
  return predictionCombos.get<ComboFilters>("/sports/combo-filters", { sport });
}

export function fetchComboEvents(params: ComboEventsParams): Promise<ComboEventsPage> {
  return predictionCombos.get<ComboEventsPage>("/sports/combo-events", {
    sport: params.sport,
    league: params.league,
    search: params.search,
    cursor: params.cursor,
    limit: params.limit,
  });
}

export function fetchComboEvent(eventId: string): Promise<ComboEvent> {
  return predictionCombos.get<ComboEvent>(`/sports/combo-events/${eventId}`);
}

export function fetchComboTeams(names: string[]): Promise<ComboTeam[]> {
  return predictionCombos.get<ComboTeam[]>("/sports/teams", {
    names: names.join("|"),
  });
}

export function fetchSportsFilters(sport: NormalSport, league?: string): Promise<SportsFilters> {
  return predictionCombos.get<SportsFilters>("/sports/filters", { sport, league });
}

export function fetchSportsEvents(params: SportsEventsParams): Promise<SportsEventsPage> {
  return predictionCombos.get<SportsEventsPage>("/sports/events", {
    sport: params.sport,
    league: params.league,
    search: params.search,
    cursor: params.cursor,
    limit: params.limit,
  });
}

export function fetchSportsEvent(eventId: string): Promise<SportsEvent> {
  return predictionCombos.get<SportsEvent>(`/sports/events/${eventId}`);
}

export function fetchDiscoveryEvents(params: DiscoveryEventsParams): Promise<DiscoveryEventsPage> {
  return predictionCombos.get<DiscoveryEventsPage>("/markets/events", {
    category: params.category,
    sort: params.sort,
    cursor: params.cursor,
    limit: params.limit,
  });
}

export function fetchDiscoveryEvent(eventId: string): Promise<DiscoveryMarketEvent> {
  return predictionCombos.get<DiscoveryMarketEvent>(`/markets/events/${eventId}`);
}
