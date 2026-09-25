"use client";

import { useSyncExternalStore } from "react";
import type { MigrationEntry } from "@/features/migrate/components/move-old-money-panel";

/**
 * ONE CARD. EVERY DOOR OPENS THE SAME ONE.
 *
 * There used to be three: the gate the app holds open on first arrival, a
 * sheet the balance card and the account menu opened, and a run the balance
 * card could start by itself. Each mounted its own copy of the panel, and
 * every bug in the upgrade came from two copies disagreeing — a sheet's
 * "done" followed by the gate's own run of the same thing.
 *
 * Now the gate host, mounted once for the session, is the only card. A door
 * asks for it here, with which door it was, and the host decides whether it
 * is locked (the offer says so) or can be put away (the person opened it).
 */
export interface MigrationRequest {
  entry: MigrationEntry;
}

let request: MigrationRequest | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function openMigration(entry: MigrationEntry): void {
  request = { entry };
  emit();
}

export function closeMigration(): void {
  if (request === null) return;
  request = null;
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const none = () => null;

/** The open request, if a door has asked for the card. */
export function useMigrationRequest(): MigrationRequest | null {
  return useSyncExternalStore(subscribe, () => request, none);
}

/** Test seam. */
export function resetMigrationRequest(): void {
  request = null;
  emit();
}
