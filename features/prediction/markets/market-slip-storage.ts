"use client";

import { useSyncExternalStore } from "react";
import { MAX_SINGLE_SELECTIONS, type MarketSlipSelection } from "./bet-slip";

const STORAGE_KEY = "wsws.prediction.market-slip.v1";
const STORAGE_EVENT = "wsws:prediction-market-slip";
const DEFAULT_STATE: MarketSlipState = { selections: [], stake: "5", submissionReview: null };
const DEFAULT_SNAPSHOT = JSON.stringify(DEFAULT_STATE);
let memorySnapshot = DEFAULT_SNAPSHOT;
let cachedRaw = DEFAULT_SNAPSHOT;
let cachedState = DEFAULT_STATE;

export interface MarketSlipState {
  selections: MarketSlipSelection[];
  stake: string;
  submissionReview: MarketSlipSubmissionReview | null;
}

export interface MarketSlipSubmissionReview {
  attemptedAt: number;
  selectionIds: string[];
}

function isString(value: unknown, max = 500): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max;
}

function isSelection(value: unknown): value is MarketSlipSelection {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<MarketSlipSelection>;
  return (
    isString(item.id, 180) &&
    (item.source === "sports" || item.source === "discovery") &&
    isString(item.eventId, 180) &&
    isString(item.eventTitle) &&
    isString(item.marketId, 180) &&
    isString(item.conditionId, 180) &&
    (item.positionId === null || isString(item.positionId, 180)) &&
    isString(item.tokenId, 180) &&
    isString(item.marketLabel) &&
    isString(item.outcome, 180) &&
    typeof item.decimalOdds === "number" &&
    Number.isFinite(item.decimalOdds) &&
    item.decimalOdds > 1
  );
}

export function parseMarketSlipSnapshot(raw: string | null): MarketSlipState {
  if (!raw || raw.length > 100_000) return DEFAULT_STATE;
  try {
    const value = JSON.parse(raw) as Partial<MarketSlipState>;
    if (
      !Array.isArray(value.selections) ||
      value.selections.length > MAX_SINGLE_SELECTIONS ||
      !value.selections.every(isSelection) ||
      new Set(value.selections.map(({ id }) => id)).size !== value.selections.length ||
      typeof value.stake !== "string" ||
      value.stake.length > 32
    ) {
      return DEFAULT_STATE;
    }
    const submissionReview = value.submissionReview;
    const validReview =
      submissionReview &&
      typeof submissionReview === "object" &&
      typeof submissionReview.attemptedAt === "number" &&
      Number.isFinite(submissionReview.attemptedAt) &&
      Array.isArray(submissionReview.selectionIds) &&
      submissionReview.selectionIds.length <= MAX_SINGLE_SELECTIONS &&
      submissionReview.selectionIds.every((id) => isString(id, 180));
    return {
      selections: value.selections,
      stake: value.stake,
      submissionReview: validReview ? submissionReview : null,
    };
  } catch {
    return DEFAULT_STATE;
  }
}

function cachedMarketSlip(raw: string): MarketSlipState {
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedState = parseMarketSlipSnapshot(raw);
  }
  return cachedState;
}

function readSnapshot(): string {
  if (typeof window === "undefined") return DEFAULT_SNAPSHOT;
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? memorySnapshot;
  } catch {
    return memorySnapshot;
  }
}

function subscribe(notify: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) {
      memorySnapshot = event.newValue ?? DEFAULT_SNAPSHOT;
      notify();
    }
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(STORAGE_EVENT, notify);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(STORAGE_EVENT, notify);
  };
}

function writeState(state: MarketSlipState) {
  const serialized = JSON.stringify(state);
  memorySnapshot = serialized;
  try {
    window.localStorage.setItem(STORAGE_KEY, serialized);
  } catch {
    // The current page still updates through the custom event when storage is unavailable.
  }
  window.dispatchEvent(new Event(STORAGE_EVENT));
}

export function updateMarketSlip(updater: (current: MarketSlipState) => MarketSlipState) {
  writeState(updater(parseMarketSlipSnapshot(readSnapshot())));
}

export function requireMarketSlipSubmissionReview(selectionIds: string[]) {
  updateMarketSlip((current) => ({
    ...current,
    submissionReview: { attemptedAt: Date.now(), selectionIds },
  }));
}

export function clearMarketSlipSubmissionReview() {
  updateMarketSlip((current) => ({ ...current, submissionReview: null }));
}

export function usePersistedMarketSlip(): MarketSlipState {
  const raw = useSyncExternalStore(subscribe, readSnapshot, () => DEFAULT_SNAPSHOT);
  return cachedMarketSlip(raw);
}
