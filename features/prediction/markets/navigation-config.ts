import type { MarketCategory, MarketNavItem } from "./types";

export const CATEGORY_LINKS: Array<MarketNavItem<MarketCategory>> = [
  { key: "trending", label: "Trending", href: "/prediction/markets" },
  { key: "football", label: "Football", href: "/prediction/markets?category=football" },
  {
    key: "basketball",
    label: "Basketball",
    href: "/prediction/markets?category=basketball",
  },
  { key: "nfl", label: "NFL", href: "/prediction/markets?category=nfl" },
  { key: "politics", label: "Politics", href: "/prediction/markets?category=politics" },
  { key: "crypto", label: "Crypto", href: "/prediction/markets?category=crypto" },
  { key: "esports", label: "Esports", href: "/prediction/markets?category=esports" },
  { key: "iran", label: "Iran", href: "/prediction/markets?category=iran" },
  { key: "finance", label: "Finance", href: "/prediction/markets?category=finance" },
  {
    key: "geopolitics",
    label: "Geopolitics",
    href: "/prediction/markets?category=geopolitics",
  },
  { key: "tech", label: "Tech", href: "/prediction/markets?category=tech" },
  { key: "culture", label: "Culture", href: "/prediction/markets?category=culture" },
  { key: "economy", label: "Economy", href: "/prediction/markets?category=economy" },
  { key: "weather", label: "Weather", href: "/prediction/markets?category=weather" },
  { key: "mentions", label: "Mentions", href: "/prediction/markets?category=mentions" },
  { key: "elections", label: "Elections", href: "/prediction/markets?category=elections" },
];

export function marketCategoryLabel(category: MarketCategory) {
  return CATEGORY_LINKS.find((item) => item.key === category)?.label ?? category;
}
