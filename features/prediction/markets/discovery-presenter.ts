import type { DiscoveryMarketEvent, DiscoveryMarketOutcome, DiscoveryMarketSummary } from "./api";

export interface DiscoverySelection {
  id: string;
  marketId: string;
  conditionId: string;
  tokenId: string;
  label: string;
  outcome: string;
  decimalOdds: number;
}

export function discoveryMarketLabel(market: DiscoveryMarketSummary): string {
  return market.groupItemTitle?.trim() || market.question;
}

export function discoverySelection(
  market: DiscoveryMarketSummary,
  outcome: DiscoveryMarketOutcome
): DiscoverySelection | null {
  if (!outcome.tokenId || outcome.decimalOdds == null) return null;
  return {
    id: `${market.id}:${outcome.name}`,
    marketId: market.id,
    conditionId: market.conditionId,
    tokenId: outcome.tokenId,
    label: discoveryMarketLabel(market),
    outcome: outcome.name,
    decimalOdds: outcome.decimalOdds,
  };
}

export function eventTopic(event: DiscoveryMarketEvent): string {
  return (
    event.tags.find((tag) => !["politics", "elections"].includes(tag.slug))?.label ?? "Politics"
  );
}

export function compactUsd(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "$0";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

export function closingLabel(value: string | null): string {
  if (!value) return "No close date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No close date";
  return `Closes ${new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: date.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
  }).format(date)}`;
}
