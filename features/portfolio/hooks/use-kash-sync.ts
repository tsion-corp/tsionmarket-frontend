"use client";

import { useSyncExternalStore } from "react";

/**
 * Whether Kash figures are currently being brought up to date.
 *
 * This is deliberately NOT "is a query fetching": the account polls every ten
 * seconds, and pulsing the balance on every background poll would make a card
 * that is simply idle look permanently busy.
 *
 * It is opened by an action that changed something and closed once the last
 * chain-settle retry has run — so the indicator covers exactly the window in
 * which the numbers on screen are known to be behind, and nothing else.
 */
let syncingUntil = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

/** Hold the syncing state open until `ms` from now. */
export function markKashSyncing(ms: number): void {
  syncingUntil = Math.max(syncingUntil, Date.now() + ms);
  if (timer) clearTimeout(timer);
  // One timer for the whole window, re-armed as later retries extend it.
  timer = setTimeout(() => {
    timer = undefined;
    emit();
  }, syncingUntil - Date.now());
  emit();
}

/** Whether the window is currently open. Exported so it can be asserted. */
export function isKashSyncing(): boolean {
  return Date.now() < syncingUntil;
}

/** Test seam: forget any open window between cases. */
export function resetKashSyncing(): void {
  syncingUntil = 0;
  if (timer) clearTimeout(timer);
  timer = undefined;
  emit();
}

export function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

/**
 * True while an action's effects are still landing. Server snapshot is false:
 * nothing is syncing during SSR, and rendering a spinner there would hydrate
 * into a mismatch.
 */
export function useKashSyncing(): boolean {
  return useSyncExternalStore(subscribe, isKashSyncing, () => false);
}
