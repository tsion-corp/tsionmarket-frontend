"use client";

import { useSyncExternalStore } from "react";
import { useAuthSession } from "@/hooks/use-auth-session";
import { useOfferMigrationState } from "@/features/migrate/hooks/use-offer-migration";
import { useMigrationRequest } from "@/features/migrate/lib/migration-card-store";

// Whether the migration gate has been completed for an account, kept PER
// ACCOUNT (not per device — the device-wide flag is what let one user's finish
// hide the migration from the next user of the same browser). Written only once
// the gate's own conditions were met, so it is never a lie.
const GATE_DONE_PREFIX = "ws.migrationGateDone:";

// A second, weaker exit: the gate is put away until a point in time, not
// finished. It never claims the migration is complete — the gate comes back
// when the window lapses, and the balance-card offer and the account-menu
// entry stay open the whole while. This is what ends the three traps (cannot
// sign into the old account; discovery keeps failing; the core sweep keeps
// failing) without letting anyone skip a migration that could still finish.
// Stored as the expiry timestamp, per account like the done flag.
const GATE_SNOOZE_PREFIX = "ws.migrationGateSnooze:";

// How long each exit puts the gate away. Recovering access to an old login
// takes days; an RPC or venue outage clears in hours.
export const SNOOZE_NO_ACCESS_MS = 7 * 24 * 60 * 60_000;
export const SNOOZE_FAILING_MS = 24 * 60 * 60_000;

// How many consecutive failures (discovery, linking, or a core sweep) it takes
// before the gate offers a way out. Not one: a transient blip must not open
// the door.
export const STUCK_AFTER_FAILURES = 3;

export function gateDoneKey(evmAddress: string | null): string | null {
  return evmAddress ? `${GATE_DONE_PREFIX}${evmAddress.toLowerCase()}` : null;
}

export function gateSnoozeKey(evmAddress: string | null): string | null {
  return evmAddress ? `${GATE_SNOOZE_PREFIX}${evmAddress.toLowerCase()}` : null;
}

// Whether the gate is snoozed at `now`. An unreadable or malformed value reads
// as not snoozed, which is the safe direction.
export function readGateSnoozed(key: string | null, now = Date.now()): boolean {
  if (!key || typeof window === "undefined") return false;
  try {
    const until = Number(window.localStorage.getItem(key));
    return Number.isFinite(until) && until > now;
  } catch {
    return false;
  }
}

export function readGateDone(key: string | null): boolean {
  if (!key || typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

// Same-tab reactivity: a storage event only fires in OTHER tabs, so writeGateDone
// notifies these listeners directly. Anything reading the flag through
// useSyncExternalStore then re-renders the moment the gate finishes.
const listeners = new Set<() => void>();

export function writeGateDone(key: string | null): void {
  if (!key || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, "1");
  } catch {
    // Storage refused (private mode, quota): the gate simply shows once more.
  }
  for (const l of listeners) l();
}

export function writeGateSnooze(key: string | null, untilMs: number): void {
  if (!key || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, String(untilMs));
  } catch {
    // Storage refused: the gate simply stays; the user can take the exit again.
  }
  for (const l of listeners) l();
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

/**
 * Whether the migration gate is currently blocking the screen: the migration is
 * offered AND this account has not finished it AND has not put it away for now.
 * Reactive — flips to false the instant the gate is completed or snoozed, so
 * anything waiting on the migration (the product tour, say) can proceed
 * without a reload.
 */
/**
 * The account's done and snoozed flags, read LIVE: they re-render the moment
 * either is written, in this tab or another. The gate reads them this way
 * so that an upgrade finished in the sheet (the balance card's button, the
 * account menu) closes the gate's door before it can open — it used to read
 * the flags once, at mount, and then open for an account that had just
 * finished elsewhere and run the whole thing again.
 */
export function useGateFlags(evmAddress: string | null): { done: boolean; snoozed: boolean } {
  const doneKey = gateDoneKey(evmAddress);
  const snoozeKey = gateSnoozeKey(evmAddress);
  const done = useSyncExternalStore(
    subscribe,
    () => readGateDone(doneKey),
    () => false
  );
  const snoozed = useSyncExternalStore(
    subscribe,
    () => readGateSnoozed(snoozeKey),
    () => false
  );
  return { done, snoozed };
}

export function useMigrationGateActive(): boolean {
  // Deciding counts as active: the tour must not start under a gate that is
  // about to open.
  const { offer, deciding } = useOfferMigrationState();
  const { evmAddress } = useAuthSession();
  const doneKey = gateDoneKey(evmAddress);
  const snoozeKey = gateSnoozeKey(evmAddress);
  const done = useSyncExternalStore(
    subscribe,
    () => readGateDone(doneKey),
    () => false
  );
  const snoozed = useSyncExternalStore(
    subscribe,
    () => readGateSnoozed(snoozeKey),
    () => false
  );
  // A door-opened card is the same card on screen; the tour waits for it too.
  const request = useMigrationRequest();
  return ((offer || deciding) && !done && !snoozed) || request !== null;
}
