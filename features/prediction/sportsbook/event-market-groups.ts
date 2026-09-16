import type { MarketOutcome, SportsbookMarket } from "./api";

export interface EventMarketGroup {
  key: string;
  title: string;
  markets: SportsbookMarket[];
}

function normalized(value: string): string {
  return value.trim().toLowerCase().replaceAll(/\s+/gu, " ");
}

export function outcomeTitle(outcome: MarketOutcome): string {
  if (!outcome.point || outcome.title.includes(outcome.point)) return outcome.title;
  return `${outcome.title} ${outcome.point}`;
}

function selectionSignature(market: SportsbookMarket): string {
  return market.outcomes
    .filter((outcome) => !outcome.hidden)
    .map((outcome) => normalized(outcomeTitle(outcome)))
    .toSorted()
    .join("\0");
}

function marketScore(market: SportsbookMarket): number {
  const odds = market.outcomes.map(({ odds }) => Number(odds) || 0);
  let score = market.state === "active" ? 1_000 : 0;
  if (odds.some((value) => value > 0)) score += 100;
  score += odds.reduce((sum, value) => sum + value, 0);
  if (market.providerState.toLowerCase() === "stopped") score -= 500;
  return score;
}

function deduplicateMarkets(markets: SportsbookMarket[]): SportsbookMarket[] {
  const order: string[] = [];
  const bySelection = new Map<string, SportsbookMarket>();

  for (const market of markets) {
    const signature = selectionSignature(market);
    const current = bySelection.get(signature);
    if (!current) {
      order.push(signature);
      bySelection.set(signature, market);
      continue;
    }
    if (marketScore(market) > marketScore(current)) bySelection.set(signature, market);
  }

  return order.map((signature) => bySelection.get(signature)!);
}

export function groupEventMarkets(markets: SportsbookMarket[]): EventMarketGroup[] {
  const groups = new Map<string, EventMarketGroup>();

  for (const market of markets) {
    const visibleOutcomes = market.outcomes.filter((outcome) => !outcome.hidden);
    if (market.hidden || visibleOutcomes.length === 0) continue;

    const key = normalized(market.title);
    const current = groups.get(key);
    if (current) {
      current.markets.push(market);
    } else {
      groups.set(key, { key, title: market.title.trim(), markets: [market] });
    }
  }

  return [...groups.values()].map((group) => ({
    ...group,
    markets: deduplicateMarkets(group.markets),
  }));
}

export function filterEventMarketGroups(
  groups: EventMarketGroup[],
  search: string
): EventMarketGroup[] {
  const query = normalized(search);
  if (!query) return groups;

  return groups.filter(
    (group) =>
      normalized(group.title).includes(query) ||
      group.markets.some((market) =>
        market.outcomes.some((outcome) => normalized(outcomeTitle(outcome)).includes(query))
      )
  );
}

export function chunkMarketOutcomes(market: SportsbookMarket): MarketOutcome[][] {
  const outcomes = market.outcomes.filter((outcome) => !outcome.hidden);
  if (outcomes.length <= 4) return outcomes.length ? [outcomes] : [];

  const size = outcomes.length % 2 === 0 ? (outcomes.length % 4 === 0 ? 4 : 2) : 3;
  const chunks: MarketOutcome[][] = [];
  for (let index = 0; index < outcomes.length; index += size) {
    chunks.push(outcomes.slice(index, index + size));
  }
  return chunks;
}
