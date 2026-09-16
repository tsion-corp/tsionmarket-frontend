"use client";

import { useSyncExternalStore } from "react";
import { toast } from "sonner";
import { isHouseEligibleOdds, type CategoryPrediction } from "./category-market-presenter";

export interface HouseSelection {
  prediction: CategoryPrediction;
  side: "yes" | "no";
}

const STORAGE_KEY = "prediction-house-accumulator-v1";
export const MAX_LOW_ODDS_SELECTIONS = 3;
export const LOW_ODDS_LIMIT_MESSAGE =
  "You can only add up to 3 selections with odds between 1.01 and 1.08.";
const EMPTY: HouseSelection[] = [];
let snapshot: HouseSelection[] = EMPTY;
let hydrated = false;
const listeners = new Set<() => void>();

function validSelection(value: unknown): value is HouseSelection {
  if (!value || typeof value !== "object") return false;
  const selection = value as Partial<HouseSelection>;
  const prediction = selection.prediction as Partial<CategoryPrediction> | undefined;
  return (
    (selection.side === "yes" || selection.side === "no") &&
    typeof prediction?.eventId === "string" &&
    typeof prediction.marketId === "string" &&
    typeof prediction.conditionId === "string" &&
    typeof prediction.q === "string" &&
    typeof prediction.yesDecimalOdds === "number" &&
    typeof prediction.noDecimalOdds === "number" &&
    isHouseEligibleOdds(prediction.yesDecimalOdds, prediction.noDecimalOdds)
  );
}

function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const decoded: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]");
    snapshot = Array.isArray(decoded) ? decoded.filter(validSelection).slice(0, 20) : EMPTY;
  } catch {
    snapshot = EMPTY;
  }
}

function emit(next: HouseSelection[]) {
  snapshot = next;
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const before = snapshot;
  hydrate();
  if (snapshot !== before) queueMicrotask(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return snapshot;
}

function getServerSnapshot() {
  return EMPTY;
}

export function houseSelectionOdds(selection: HouseSelection): number {
  return selection.side === "yes"
    ? selection.prediction.yesDecimalOdds
    : selection.prediction.noDecimalOdds;
}

export function isLowOddsSelection(selection: HouseSelection): boolean {
  const oddsInCents = Math.round(houseSelectionOdds(selection) * 100);
  return oddsInCents >= 101 && oddsInCents <= 108;
}

export function lowOddsSelectionCount(selections: HouseSelection[]): number {
  return selections.filter(isLowOddsSelection).length;
}

export function canAddHouseSelection(
  selections: HouseSelection[],
  candidate: HouseSelection
): boolean {
  const selectionsWithoutCandidateMarket = selections.filter(
    (selection) => selection.prediction.conditionId !== candidate.prediction.conditionId
  );
  return (
    !isLowOddsSelection(candidate) ||
    lowOddsSelectionCount(selectionsWithoutCandidateMarket) < MAX_LOW_ODDS_SELECTIONS
  );
}

export function useHouseSlip() {
  const selections = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  return {
    selections,
    toggle(prediction: CategoryPrediction, side: "yes" | "no") {
      const existing = selections.find(
        (selection) => selection.prediction.conditionId === prediction.conditionId
      );
      if (existing?.side === side) {
        emit(
          selections.filter(
            (selection) => selection.prediction.conditionId !== prediction.conditionId
          )
        );
        return;
      }
      const next = selections.filter(
        (selection) => selection.prediction.conditionId !== prediction.conditionId
      );
      if (next.length >= 20) return;
      const candidate = { prediction, side };
      if (!canAddHouseSelection(selections, candidate)) {
        toast.error(LOW_ODDS_LIMIT_MESSAGE);
        return;
      }
      emit([...next, candidate]);
    },
    remove(conditionId: string) {
      emit(selections.filter((selection) => selection.prediction.conditionId !== conditionId));
    },
    clear() {
      emit(EMPTY);
    },
    selectedSide(conditionId: string) {
      return selections.find((selection) => selection.prediction.conditionId === conditionId)?.side;
    },
  };
}
