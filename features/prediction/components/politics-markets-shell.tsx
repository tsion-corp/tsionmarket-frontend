"use client";

import type { PredictionMarketCategory } from "../categories";
import type { DiscoveryMarketSort } from "../markets/api";
import type { PredictionFeedFilter } from "./prediction-category-nav";
import { DiscoveryMarketsFeed } from "./trending-markets-feed";

function activeFeedFilter(
  category: PredictionMarketCategory,
  sort: DiscoveryMarketSort
): PredictionFeedFilter | undefined {
  if (category !== "trending") return undefined;
  if (sort === "ending_soon") return "breaking";
  if (sort === "newest") return "new";
  return "trending";
}

export function CategoryMarketsShell({
  category,
  sort = "volume_24h",
}: {
  category: PredictionMarketCategory;
  sort?: DiscoveryMarketSort;
}) {
  return (
    <DiscoveryMarketsFeed
      category={category}
      sort={sort}
      activeFilter={activeFeedFilter(category, sort)}
    />
  );
}
