import type { MarketCategory, SportsLeagueKey } from "./types";

const MARKET_CATEGORIES = new Set<MarketCategory>([
  "trending",
  "football",
  "basketball",
  "nfl",
  "politics",
  "crypto",
  "esports",
  "iran",
  "finance",
  "geopolitics",
  "tech",
  "culture",
  "economy",
  "weather",
  "mentions",
  "elections",
]);

function readParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export function resolveMarketNavigation(params: Record<string, string | string[] | undefined>) {
  const requestedCategory = readParam(params.category);
  const requestedLeague = readParam(params.league);
  const activeCategory = MARKET_CATEGORIES.has(requestedCategory as MarketCategory)
    ? (requestedCategory as MarketCategory)
    : "trending";
  const activeLeague: SportsLeagueKey =
    activeCategory === "football" && requestedLeague && /^[a-z0-9-]{1,64}$/u.test(requestedLeague)
      ? requestedLeague
      : "";

  return { activeCategory, activeLeague };
}
