export const PREDICTION_CATEGORIES = [
  {
    key: "trending",
    label: "Trending",
    description: "Markets drawing the most activity now",
  },
  {
    key: "politics",
    label: "Politics",
    description: "Elections, policy and world leaders",
  },
  {
    key: "sports",
    label: "Sports",
    description: "Matches, leagues and live events",
  },
  {
    key: "crypto",
    label: "Crypto",
    description: "Prices, tokens and regulation",
  },
  {
    key: "esports",
    label: "Esports",
    description: "Competitive gaming and tournaments",
  },
  {
    key: "iran",
    label: "Iran",
    description: "Iranian politics, diplomacy and conflict",
  },
  {
    key: "finance",
    label: "Finance",
    description: "Markets, rates and companies",
  },
  {
    key: "geopolitics",
    label: "Geopolitics",
    description: "International relations and conflict",
  },
  {
    key: "tech",
    label: "Tech",
    description: "Products, AI and the internet",
  },
  {
    key: "culture",
    label: "Culture",
    description: "Entertainment, media and awards",
  },
  {
    key: "economy",
    label: "Economy",
    description: "Growth, inflation and employment",
  },
  {
    key: "weather",
    label: "Weather",
    description: "Forecasts, climate and extreme weather",
  },
  {
    key: "mentions",
    label: "Mentions",
    description: "People and topics in public conversation",
  },
  {
    key: "elections",
    label: "Elections",
    description: "Campaigns, polling and election outcomes",
  },
] as const;

export type PredictionCategory = (typeof PREDICTION_CATEGORIES)[number]["key"];
export type PredictionMarketCategory = Exclude<PredictionCategory, "sports">;

const CATEGORY_KEYS = new Set<string>(PREDICTION_CATEGORIES.map(({ key }) => key));

export function parsePredictionCategory(value: string | null | undefined): PredictionCategory {
  return value && CATEGORY_KEYS.has(value) ? (value as PredictionCategory) : "sports";
}

export function predictionCategoryHref(category: PredictionCategory): string {
  return category === "sports"
    ? "/prediction/markets?sport=football&state=prematch"
    : `/prediction/markets?category=${category}`;
}

export function predictionCategoryAvailable(category: PredictionCategory): boolean {
  return CATEGORY_KEYS.has(category);
}

export function isPredictionMarketCategory(
  category: PredictionCategory
): category is PredictionMarketCategory {
  return category !== "sports";
}
