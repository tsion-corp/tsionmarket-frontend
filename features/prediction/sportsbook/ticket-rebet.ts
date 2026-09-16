import type { SlipSelection, SportsbookOrder, SportsbookOrderStatus } from "./api";

const REBETTABLE_STATUSES = new Set<SportsbookOrderStatus>(["rejected", "failed", "canceled"]);

export function canRebet(status: SportsbookOrderStatus): boolean {
  return REBETTABLE_STATUSES.has(status);
}

export function selectionsFromOrder(order: Pick<SportsbookOrder, "legs">): SlipSelection[] {
  return order.legs
    .toSorted((left, right) => left.index - right.index)
    .map((leg) => ({
      id: `${leg.conditionId}:${leg.outcomeId}`,
      eventId: leg.eventId,
      eventTitle: leg.eventTitle,
      eventKind: leg.eventKind,
      conditionId: leg.conditionId,
      marketTitle: leg.marketTitle,
      outcomeId: leg.outcomeId,
      outcomeTitle: leg.outcomeTitle,
      odds: leg.acceptedOdds ?? leg.requestedOdds,
      expressForbidden: false,
    }));
}
