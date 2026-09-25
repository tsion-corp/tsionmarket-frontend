import dynamic from "next/dynamic";
import {
  isPredictionMarketCategory,
  parsePredictionCategory,
} from "@/features/prediction/categories";
import {
  SportsbookShell,
  type SportsbookEventKind,
  type SportsbookGameState,
} from "@/features/prediction/sportsbook";
import type { DiscoveryMarketSort } from "@/features/prediction/markets/api";

const CategoryMarketsShell = dynamic(() =>
  import("@/features/prediction/components/politics-markets-shell").then(
    (module) => module.CategoryMarketsShell
  )
);

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function PredictionMarketsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const query = await searchParams;
  const value = (key: string) => {
    const candidate = query[key];
    return typeof candidate === "string" ? candidate : "";
  };
  const requestedState = value("state");
  const state: SportsbookGameState =
    requestedState === "live" || requestedState === "all" ? requestedState : "prematch";
  const requestedKind = value("kind");
  const eventKind: SportsbookEventKind =
    requestedKind === "virtual" || requestedKind === "esports" ? requestedKind : "sports";
  const category = parsePredictionCategory(value("category"));
  const requestedSort = value("sort");
  const sort: DiscoveryMarketSort =
    requestedSort === "volume" ||
    requestedSort === "liquidity" ||
    requestedSort === "newest" ||
    requestedSort === "ending_soon"
      ? requestedSort
      : "volume_24h";

  if (isPredictionMarketCategory(category)) {
    return <CategoryMarketsShell key={`${category}:${sort}`} category={category} sort={sort} />;
  }

  return (
    <SportsbookShell
      requestedSport={value("sport") || "football"}
      country={value("country")}
      league={value("league")}
      state={state}
      eventKind={eventKind}
      initialView={value("view") === "tickets" ? "tickets" : "markets"}
    />
  );
}
