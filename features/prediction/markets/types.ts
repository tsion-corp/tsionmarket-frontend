import type { DiscoveryCategory, NormalSport } from "./api";

export type MarketCategory = NormalSport | DiscoveryCategory;

export type SportsLeagueKey = string;

export function isNormalSportCategory(
  category: MarketCategory
): category is Extract<NormalSport, "football"> {
  return category === "football";
}

export interface MarketNavItem<Key extends string> {
  key: Key;
  label: string;
  href: string;
  badge?: string;
}
