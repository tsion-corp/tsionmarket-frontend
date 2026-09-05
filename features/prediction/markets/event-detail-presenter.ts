import type { ComboEvent, ComboMarket, ComboMarketType, ComboSelection } from "./api";
import type { BoardSelection } from "./presenter";

export type EventMarketTab = "all" | ComboMarketType;

export interface EventOutcomeView {
  selection: BoardSelection;
  executable: boolean;
}

export interface EventMarketCardView {
  id: string;
  title: string;
  question: string;
  line: number | null;
  marketType: ComboMarketType;
  outcomes: EventOutcomeView[];
}

export interface EventMarketGroupView {
  key: ComboMarketType;
  title: string;
  cards: EventMarketCardView[];
}

function selectionView(
  event: ComboEvent,
  market: ComboMarket,
  selection: ComboSelection,
  label: string
): EventOutcomeView | null {
  if (selection.decimalOdds == null) return null;
  return {
    selection: {
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
    },
    executable: selection.positionId != null && selection.tokenId != null,
  };
}

function matchResultCard(event: ComboEvent): EventMarketCardView | null {
  const outcomes = event.moneyline.flatMap((market) => {
    const yes = market.selections.find((selection) => selection.outcome.toLowerCase() === "yes");
    const label = market.label?.trim() || market.question;
    const outcome = yes ? selectionView(event, market, yes, label) : null;
    return outcome ? [outcome] : [];
  });
  if (outcomes.length === 0) return null;
  return {
    id: `match-result:${event.id}`,
    title: "Match result",
    question: event.title,
    line: null,
    marketType: "moneyline",
    outcomes,
  };
}

function marketCard(event: ComboEvent, market: ComboMarket): EventMarketCardView | null {
  const outcomes = market.selections.flatMap((selection) => {
    const outcome = selectionView(event, market, selection, selection.outcome);
    return outcome ? [outcome] : [];
  });
  if (outcomes.length === 0) return null;

  const title =
    market.marketType === "total"
      ? "Total goals"
      : market.label?.trim() || market.question || "Handicap";
  return {
    id: market.id,
    title,
    question: market.question,
    line: market.line,
    marketType: market.marketType,
    outcomes,
  };
}

function cardsFor(event: ComboEvent, markets: ComboMarket[]): EventMarketCardView[] {
  return markets.flatMap((market) => {
    const card = marketCard(event, market);
    return card ? [card] : [];
  });
}

export function eventMarketGroups(event: ComboEvent): EventMarketGroupView[] {
  const result = matchResultCard(event);
  const groups: EventMarketGroupView[] = [
    { key: "moneyline", title: "Moneyline", cards: result ? [result] : [] },
    { key: "total", title: "Goals", cards: cardsFor(event, event.totals) },
    { key: "spread", title: "Spread", cards: cardsFor(event, event.spreads) },
  ];
  return groups.filter((group) => group.cards.length > 0);
}
