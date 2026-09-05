"use client";

import { useSyncExternalStore } from "react";
import type { SlipSelection } from "./api";

const LEGACY_STORAGE_KEY = "wsws.prediction.sportsbook-slip.v1";
const STORAGE_KEY = "wsws.prediction.sportsbook-slip.v2";
const STORAGE_EVENT = "wsws:sportsbook-slip";
const DEFAULT_STATE: SportsbookSlip = { selections: [], stake: "2", denomination: "USDC" };
const DEFAULT_SNAPSHOT = JSON.stringify(DEFAULT_STATE);
let memorySnapshot = DEFAULT_SNAPSHOT;

export interface SportsbookSlip {
  selections: SlipSelection[];
  stake: string;
  denomination: "USDC";
}

function isSelection(value: unknown): value is SlipSelection {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<SlipSelection>;
  return (
    typeof item.id === "string" &&
    typeof item.eventId === "string" &&
    typeof item.eventTitle === "string" &&
    (item.eventKind === "sports" || item.eventKind === "esports" || item.eventKind === "virtual") &&
    typeof item.conditionId === "string" &&
    typeof item.marketTitle === "string" &&
    typeof item.outcomeId === "string" &&
    typeof item.outcomeTitle === "string" &&
    typeof item.odds === "string" &&
    typeof item.expressForbidden === "boolean"
  );
}

export function parseSportsbookSlip(raw: string | null): SportsbookSlip {
  if (!raw || raw.length > 100_000) return DEFAULT_STATE;
  try {
    const value = JSON.parse(raw) as Partial<SportsbookSlip>;
    if (
      !Array.isArray(value.selections) ||
      value.selections.length > 20 ||
      !value.selections.every(isSelection) ||
      typeof value.stake !== "string" ||
      value.stake.length > 48
    ) {
      return DEFAULT_STATE;
    }
    return {
      selections: value.selections,
      stake: value.denomination === "USDC" ? value.stake : DEFAULT_STATE.stake,
      denomination: "USDC",
    };
  } catch {
    return DEFAULT_STATE;
  }
}

function readSnapshot(): string {
  if (typeof window === "undefined") return DEFAULT_SNAPSHOT;
  try {
    const persisted = window.localStorage.getItem(STORAGE_KEY);
    if (persisted) return persisted;
    const legacy = window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!legacy) return memorySnapshot;
    return JSON.stringify({ ...parseSportsbookSlip(legacy), stake: DEFAULT_STATE.stake });
  } catch {
    return memorySnapshot;
  }
}

function subscribe(notify: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY) return;
    memorySnapshot = event.newValue ?? DEFAULT_SNAPSHOT;
    notify();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(STORAGE_EVENT, notify);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(STORAGE_EVENT, notify);
  };
}

export function updateSportsbookSlip(update: (current: SportsbookSlip) => SportsbookSlip) {
  const next = update(parseSportsbookSlip(readSnapshot()));
  const raw = JSON.stringify(next);
  memorySnapshot = raw;
  try {
    window.localStorage.setItem(STORAGE_KEY, raw);
  } catch {
    // In-memory state still works when browser storage is disabled.
  }
  window.dispatchEvent(new Event(STORAGE_EVENT));
}

export function toggleSportsbookSelection(selection: SlipSelection) {
  updateSportsbookSlip((current) => {
    if (current.selections.some(({ id }) => id === selection.id)) {
      return { ...current, selections: current.selections.filter(({ id }) => id !== selection.id) };
    }
    if (selection.expressForbidden) return { ...current, selections: [selection] };
    const compatible = current.selections.filter(
      (item) => item.conditionId !== selection.conditionId && !item.expressForbidden
    );
    return { ...current, selections: [...compatible, selection].slice(-20) };
  });
}

export function useSportsbookSlip(): SportsbookSlip {
  const raw = useSyncExternalStore(subscribe, readSnapshot, () => DEFAULT_SNAPSHOT);
  return parseSportsbookSlip(raw);
}
