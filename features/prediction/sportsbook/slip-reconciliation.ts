import type { SlipSelection, SportsbookMarket } from "./api";

export interface SlipReconciliation {
  selections: SlipSelection[];
  unavailableSelectionIds: string[];
  changed: boolean;
}

function normalized(value: string): string {
  return value.trim().toLowerCase().replaceAll(/\s+/gu, " ");
}

function isAvailableMarket(market: SportsbookMarket): boolean {
  return (
    market.state === "active" && !market.hidden && (market.prematchEnabled || market.liveEnabled)
  );
}

function activeOutcome(market: SportsbookMarket, selection: SlipSelection) {
  const outcomes = market.outcomes.filter(
    (outcome) => outcome.state === "active" && !outcome.hidden && Number(outcome.odds) > 0
  );
  return (
    outcomes.find((outcome) => outcome.id === selection.outcomeId) ??
    outcomes.find((outcome) => normalized(outcome.title) === normalized(selection.outcomeTitle))
  );
}

export function reconcileSlipSelections(
  selections: SlipSelection[],
  markets: SportsbookMarket[]
): SlipReconciliation {
  const marketsByEvent = new Map<string, SportsbookMarket[]>();
  for (const market of markets) {
    if (!market.eventId || !isAvailableMarket(market)) continue;
    const eventMarkets = marketsByEvent.get(market.eventId) ?? [];
    eventMarkets.push(market);
    marketsByEvent.set(market.eventId, eventMarkets);
  }

  const unavailableSelectionIds: string[] = [];
  let changed = false;
  const refreshed = selections.map((selection) => {
    const eventMarkets = marketsByEvent.get(selection.eventId) ?? [];
    const exactMarket = eventMarkets.find((market) => market.id === selection.conditionId);
    const exactOutcome = exactMarket ? activeOutcome(exactMarket, selection) : undefined;
    const replacement = exactOutcome
      ? { market: exactMarket as SportsbookMarket, outcome: exactOutcome }
      : eventMarkets
          .filter((market) => normalized(market.title) === normalized(selection.marketTitle))
          .map((market) => ({ market, outcome: activeOutcome(market, selection) }))
          .find(
            (
              candidate
            ): candidate is {
              market: SportsbookMarket;
              outcome: NonNullable<ReturnType<typeof activeOutcome>>;
            } => Boolean(candidate.outcome)
          );

    if (!replacement) {
      unavailableSelectionIds.push(selection.id);
      return selection;
    }

    const next: SlipSelection = {
      ...selection,
      id: `${replacement.market.id}:${replacement.outcome.id}`,
      conditionId: replacement.market.id,
      marketTitle: replacement.market.title,
      outcomeId: replacement.outcome.id,
      outcomeTitle: replacement.outcome.title,
      odds: replacement.outcome.odds,
      expressForbidden: replacement.market.expressForbidden,
    };
    if (
      next.id !== selection.id ||
      next.odds !== selection.odds ||
      next.expressForbidden !== selection.expressForbidden
    ) {
      changed = true;
    }
    return next;
  });

  return { selections: refreshed, unavailableSelectionIds, changed };
}
