import type { DiscoveryMarketEvent } from "./api";
import type { DiscoverySelection } from "./discovery-presenter";
import type { BoardSelection } from "./presenter";

const E6 = 1_000_000n;
export const MAX_SINGLE_SELECTIONS = 15;
export const MAX_SLIP_SELECTIONS = 50;

export type BetSlipMode = "combo" | "singles";

export interface MarketSlipSelection {
  id: string;
  source: "sports" | "discovery";
  eventId: string;
  eventTitle: string;
  marketId: string;
  conditionId: string;
  positionId: string | null;
  tokenId: string;
  marketLabel: string;
  outcome: string;
  decimalOdds: number;
}

export function sportsSlipSelection(selection: BoardSelection): MarketSlipSelection | null {
  if (!selection.tokenId) return null;
  return {
    id: selection.id,
    source: "sports",
    eventId: selection.eventId,
    eventTitle: selection.eventTitle,
    marketId: selection.marketId,
    conditionId: selection.conditionId,
    positionId: selection.positionId,
    tokenId: selection.tokenId,
    marketLabel: selection.marketLabel,
    outcome: selection.outcome,
    decimalOdds: selection.decimalOdds,
  };
}

export function discoverySlipSelection(
  event: DiscoveryMarketEvent,
  selection: DiscoverySelection
): MarketSlipSelection {
  return {
    id: selection.id,
    source: "discovery",
    eventId: event.id,
    eventTitle: event.title,
    marketId: selection.marketId,
    conditionId: selection.conditionId,
    positionId: null,
    tokenId: selection.tokenId,
    marketLabel: selection.label,
    outcome: selection.outcome,
    decimalOdds: selection.decimalOdds,
  };
}

export function toggleSlipSelection(
  selections: MarketSlipSelection[],
  candidate: MarketSlipSelection
): MarketSlipSelection[] {
  if (selections.some((selection) => selection.id === candidate.id)) {
    return selections.filter((selection) => selection.id !== candidate.id);
  }

  const withoutConflictingOutcome = selections.filter(
    (selection) => selection.conditionId !== candidate.conditionId
  );
  if (withoutConflictingOutcome.length >= MAX_SINGLE_SELECTIONS) return selections;
  return [...withoutConflictingOutcome, candidate];
}

export function comboAvailable(selections: MarketSlipSelection[]): boolean {
  return (
    selections.length >= 2 &&
    selections.length <= MAX_SLIP_SELECTIONS &&
    selections.every((selection) => selection.source === "sports" && selection.positionId != null)
  );
}

export function resolveBetSlipMode(
  selections: MarketSlipSelection[],
  requestedMode: BetSlipMode
): BetSlipMode {
  return requestedMode === "combo" && comboAvailable(selections) ? "combo" : "singles";
}

export function parseUsdE6(value: string): bigint | null {
  const normalized = value.trim();
  const match = /^(\d+)(?:\.(\d{0,6}))?$/u.exec(normalized);
  if (!match) return null;
  const amount = BigInt(match[1]) * E6 + BigInt((match[2] ?? "").padEnd(6, "0"));
  return amount > 0n ? amount : null;
}

function oddsE6(decimalOdds: number): bigint {
  if (!Number.isFinite(decimalOdds) || decimalOdds <= 0) return 0n;
  return BigInt(Math.round(decimalOdds * Number(E6)));
}

export function combinedReferenceOddsE6(selections: MarketSlipSelection[]): bigint {
  return selections.reduce(
    (combined, selection) => (combined * oddsE6(selection.decimalOdds)) / E6,
    E6
  );
}

export function summedReferenceOddsE6(selections: MarketSlipSelection[]): bigint {
  return selections.reduce((total, selection) => total + oddsE6(selection.decimalOdds), 0n);
}

export function totalStakeE6(
  selections: MarketSlipSelection[],
  stakeE6: bigint,
  mode: BetSlipMode
): bigint {
  return mode === "combo" ? stakeE6 : stakeE6 * BigInt(selections.length);
}

export function referenceReturnE6(
  selections: MarketSlipSelection[],
  stakeE6: bigint,
  mode: BetSlipMode
): bigint {
  if (mode === "combo") {
    return (stakeE6 * combinedReferenceOddsE6(selections)) / E6;
  }
  return selections.reduce(
    (total, selection) => total + (stakeE6 * oddsE6(selection.decimalOdds)) / E6,
    0n
  );
}

export function formatUsdE6(value: bigint): string {
  const cents = (value + 5_000n) / 10_000n;
  const whole = cents / 100n;
  const fraction = (cents % 100n).toString().padStart(2, "0");
  return `$${whole.toLocaleString("en-US")}.${fraction}`;
}

export function formatReferenceOdds(valueE6: bigint): string {
  const whole = valueE6 / E6;
  const fraction = ((valueE6 % E6) / 10_000n).toString().padStart(2, "0");
  return `${whole.toString()}.${fraction}`;
}
