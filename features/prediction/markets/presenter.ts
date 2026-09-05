import type { ComboEvent, ComboMarket, ComboSelection } from "./api";

export type MarketWindow = "today" | "next-24h" | "upcoming";

export interface BoardSelection {
  id: string;
  eventId: string;
  eventTitle: string;
  marketId: string;
  conditionId: string;
  positionId: string | null;
  tokenId: string | null;
  label: string;
  marketLabel: string;
  outcome: string;
  decimalOdds: number;
}

export interface BoardTotalOption {
  id: string;
  line: number;
  over: BoardSelection | null;
  under: BoardSelection | null;
}

export interface FixtureBoardRow {
  id: string;
  title: string;
  startTime: string | null;
  live: boolean;
  homeName: string;
  awayName: string;
  homeLogoUrl: string | null;
  awayLogoUrl: string | null;
  homeColor: string | null;
  awayColor: string | null;
  home: BoardSelection | null;
  draw: BoardSelection | null;
  away: BoardSelection | null;
  totalOptions: BoardTotalOption[];
  defaultTotalId: string | null;
  additionalSelections: number;
}

export interface LeagueBoardGroup {
  slug: string;
  name: string;
  imageUrl: string | null;
  fixtures: FixtureBoardRow[];
}

function normalized(value: string | null | undefined): string {
  return value?.trim().toLocaleLowerCase() ?? "";
}

function selectionFor(
  event: ComboEvent,
  market: ComboMarket | undefined,
  outcome: string,
  label: string
): BoardSelection | null {
  const selection = market?.selections.find(
    (candidate) => normalized(candidate.outcome) === normalized(outcome)
  );
  if (!market || !selection || selection.decimalOdds == null) return null;

  return {
    id: `${market.id}:${selection.outcomeIndex}`,
    eventId: event.id,
    eventTitle: event.title,
    marketId: market.id,
    conditionId: market.conditionId,
    positionId: selection.positionId,
    tokenId: selection.tokenId,
    label,
    marketLabel: market.label?.trim() || market.question,
    outcome: selection.outcome,
    decimalOdds: selection.decimalOdds,
  };
}

function yesMarketFor(event: ComboEvent, label: string): ComboMarket | undefined {
  const target = normalized(label);
  return event.moneyline.find((market) => normalized(market.label) === target);
}

function drawMarket(event: ComboEvent): ComboMarket | undefined {
  return event.moneyline.find(
    (market) =>
      market.slug.endsWith("-draw") ||
      normalized(market.label).startsWith("draw") ||
      normalized(market.question).includes("end in a draw")
  );
}

function totalOptionsFor(event: ComboEvent): BoardTotalOption[] {
  return event.totals
    .filter((market): market is ComboMarket & { line: number } => market.line != null)
    .map((market) => ({
      id: market.id,
      line: market.line,
      over: selectionFor(event, market, "Over", "Over"),
      under: selectionFor(event, market, "Under", "Under"),
    }))
    .filter((option) => option.over != null || option.under != null)
    .sort((left, right) => left.line - right.line);
}

function defaultTotal(options: BoardTotalOption[]): BoardTotalOption | undefined {
  return [...options].sort((left, right) => {
    const distance = Math.abs(left.line - 2.5) - Math.abs(right.line - 2.5);
    return distance || left.line - right.line;
  })[0];
}

function executableSelectionCount(markets: ComboMarket[]): number {
  return markets.reduce(
    (count, market) =>
      count +
      market.selections.filter(
        (selection: ComboSelection) =>
          selection.decimalOdds != null && selection.positionId != null && selection.tokenId != null
      ).length,
    0
  );
}

export function toFixtureBoardRow(event: ComboEvent): FixtureBoardRow {
  const home = event.teams.find((team) => team.ordering === "home") ?? event.teams[0];
  const away = event.teams.find((team) => team.ordering === "away") ?? event.teams[1];
  const homeName = home?.name ?? "Home";
  const awayName = away?.name ?? "Away";
  const totalOptions = totalOptionsFor(event);
  const preferredTotal = defaultTotal(totalOptions);
  const threeWaySelections = [
    selectionFor(event, yesMarketFor(event, homeName), "Yes", "1"),
    selectionFor(event, drawMarket(event), "Yes", "X"),
    selectionFor(event, yesMarketFor(event, awayName), "Yes", "2"),
  ];
  const displayedExecutable = [
    ...threeWaySelections,
    ...totalOptions.flatMap((option) => [option.over, option.under]),
  ].filter((selection) => selection?.positionId != null && selection.tokenId != null).length;
  const allMarkets = [...event.moneyline, ...event.spreads, ...event.totals];

  return {
    id: event.id,
    title: event.title,
    startTime: event.startTime,
    live: event.live,
    homeName,
    awayName,
    homeLogoUrl: home?.logoUrl ?? null,
    awayLogoUrl: away?.logoUrl ?? null,
    homeColor: home?.color ?? null,
    awayColor: away?.color ?? null,
    home: threeWaySelections[0],
    draw: threeWaySelections[1],
    away: threeWaySelections[2],
    totalOptions,
    defaultTotalId: preferredTotal?.id ?? null,
    additionalSelections: Math.max(0, executableSelectionCount(allMarkets) - displayedExecutable),
  };
}

export function groupLeagueFixtures(events: ComboEvent[]): LeagueBoardGroup[] {
  const groups = new Map<string, LeagueBoardGroup>();
  const sorted = [...events].sort((left, right) =>
    (left.startTime ?? "").localeCompare(right.startTime ?? "")
  );

  for (const event of sorted) {
    const key = event.league.slug || event.league.name;
    const existing = groups.get(key);
    if (existing) {
      existing.fixtures.push(toFixtureBoardRow(event));
      continue;
    }
    groups.set(key, {
      slug: event.league.slug,
      name: event.league.name,
      imageUrl: event.league.imageUrl,
      fixtures: [toFixtureBoardRow(event)],
    });
  }

  return [...groups.values()];
}

export function filterEventsByWindow(
  events: ComboEvent[],
  window: MarketWindow,
  now = new Date()
): ComboEvent[] {
  return events.filter((event) => {
    if (!event.startTime) return false;
    const start = new Date(event.startTime);
    const sameDay =
      start.getFullYear() === now.getFullYear() &&
      start.getMonth() === now.getMonth() &&
      start.getDate() === now.getDate();

    if (window === "today") return event.live || sameDay;
    if (window === "next-24h") {
      const nextDay = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      return !event.live && start > now && start <= nextDay;
    }
    return !event.live && start > now && !sameDay;
  });
}
