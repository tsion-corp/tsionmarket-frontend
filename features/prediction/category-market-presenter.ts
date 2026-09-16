import type { Prediction } from "@/lib/types";
import type { PredictionCategory } from "./categories";
import type { DiscoveryMarketEvent, DiscoveryMarketSummary } from "./markets/api";

export interface CategoryPrediction extends Prediction {
  eventId: string;
  eventTitle: string;
  marketId: string;
  conditionId: string;
  tradable: boolean;
  yesDecimalOdds: number;
  noDecimalOdds: number;
}

export const HOUSE_FAVORITE_MAX_ODDS = 1.08;

export function isHouseEligibleOdds(yesOdds: number, noOdds: number): boolean {
  return (
    (Number.isFinite(yesOdds) && yesOdds >= 1 && yesOdds <= HOUSE_FAVORITE_MAX_ODDS) ||
    (Number.isFinite(noOdds) && noOdds >= 1 && noOdds <= HOUSE_FAVORITE_MAX_ODDS)
  );
}

export function usdcVolume(volume: string): string {
  const display = volume
    .replace(/^\$/u, "")
    .replace(/\s*vol$/iu, "")
    .trim();
  return display ? `${display} USDC` : "-";
}

export function compactVolume(value: number | null): string {
  if (value == null || !Number.isFinite(value) || value <= 0) return "";
  return `$${Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value)} vol`;
}

export function marketTag(event: DiscoveryMarketEvent, category: PredictionCategory): string {
  return (
    event.tags.find((tag) => tag.slug !== category && tag.slug !== "all")?.label ??
    category[0].toUpperCase() + category.slice(1)
  );
}

export function marketPrediction(
  event: DiscoveryMarketEvent,
  market: DiscoveryMarketSummary,
  category: PredictionCategory
): CategoryPrediction | null {
  const yes = market.outcomes.find((outcome) => outcome.name.toLowerCase() === "yes");
  const no = market.outcomes.find((outcome) => outcome.name.toLowerCase() === "no");
  if (
    !yes?.tokenId ||
    !no?.tokenId ||
    yes.referencePrice == null ||
    no.referencePrice == null ||
    yes.decimalOdds == null ||
    no.decimalOdds == null ||
    !market.conditionId ||
    !isHouseEligibleOdds(yes.decimalOdds, no.decimalOdds)
  ) {
    return null;
  }
  const yesCents = yes.referencePrice * 100;
  const noCents = no.referencePrice * 100;
  return {
    eventId: event.id,
    eventTitle: event.title,
    marketId: market.id,
    tradable:
      event.active &&
      !event.closed &&
      market.active &&
      !market.closed &&
      market.acceptingOrders &&
      market.enableOrderBook,
    tag: marketTag(event, category),
    vol: compactVolume(market.volume24h ?? market.volume ?? event.volume24h ?? event.volume),
    q: market.question,
    yes: `${yesCents}¢`,
    no: `${noCents}¢`,
    pct: Math.round(yesCents),
    image: market.imageUrl ?? market.iconUrl ?? event.imageUrl ?? event.iconUrl,
    yesTokenId: yes.tokenId,
    noTokenId: no.tokenId,
    conditionId: market.conditionId,
    yesDecimalOdds: yes.decimalOdds,
    noDecimalOdds: no.decimalOdds,
  };
}

// Where a Polymarket event opens.
//
// `source=markets` is the disambiguator, and it is the whole reason this
// function exists rather than a template literal at each call site. The detail
// route serves two products off one path: Polymarket events, keyed by Gamma's
// ids, and sportsbook fixtures, keyed by the sportsbook's own. Nothing in an id
// says which space it came from, so without a marker the route has to guess,
// and it guessed by category. That worked only because sports was refused
// outright, which is what left every sports card on the desk dead.
//
// With the marker the route stops guessing: this parameter says "Gamma id,
// serve it from the discovery feed", and it says so for sports too. Bare
// `?category=politics` links still resolve, so anything already bookmarked
// keeps working.
export function categoryEventHref(eventId: string, category: PredictionCategory): string {
  if (category !== "sports") {
    return `/prediction/event/${encodeURIComponent(eventId)}?source=markets&category=${category}`;
  }
  return `/prediction/markets/${encodeURIComponent(eventId)}?category=${category}&source=markets`;
}
