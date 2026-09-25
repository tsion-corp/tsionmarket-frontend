"use client";

import { useSyncExternalStore } from "react";
import type { MigrationStatus } from "@/features/migrate/lib/api";

// Whether to offer the one-click Update Balance migration on the balance
// card. Three facts decide it:
//
// 1. This browser holds Privy session state (the `privy:` auth keys), which
//    only a past Privy sign-in leaves behind. A Decane-native signup never
//    sees the button.
// 2. The migration service, once linked, says the old wallet still holds
//    money or has a bank deposit on its way. This is what makes a brand-new
//    device offer the button too.
// 3. The migration has not already completed here. The button marks
//    completion when every asset landed, or when the old account turned out
//    to hold nothing to move.
//
// The Account modal's entry ignores all of this and is always available.

// Keys Privy only writes around a real session, not on a bare provider mount
// (which would false-positive as soon as the button itself mounts Privy).
const PRIVY_SESSION_KEYS = [
  "privy:token",
  "privy:refresh_token",
  "privy:id_token",
  "privy:connections",
];

// Every flag below is kept PER ACCOUNT, keyed by the Decane EVM address the
// same way the gate's own done flag is (gate-state.ts). A device-wide flag is
// what let one user's finish hide the migration from the next user of the same
// browser. With no account to key on, a flag reads false and writes nothing.
const MIGRATION_COMPLETE_PREFIX = "ws.migrationComplete:";

// Set the first time a run actually moves something. The migration can stay
// unfinished for days (challenge windows, keeper fills, a venue that was
// down), and masking a balance that already holds the user's money is worse
// than showing a figure that is not final yet.
const FUNDS_MOVED_PREFIX = "ws.migrationMoved:";

// Set once this device has CONFIRMED the signed-in account is linked — the
// service answered `linked: true`. A confirmed link is durable (only an admin
// remap undoes it, and a live `linked: false` outranks this memory), so it is
// safe to cache: a later load knows the account is linked before /status
// answers and skips the legacy directory lookup. Written under BOTH the email
// and the address, and read from either: an X-only or passkey account has no
// email, and would otherwise re-run the lookup every load. Any residual
// old-wallet funds stay reachable through the always-open "Move money from old
// wallet" entry, which this flag does not touch.
const LINKED_EMAIL_PREFIX = "ws.migrationLinkedEmail:";
const LINKED_ACCOUNT_PREFIX = "ws.migrationLinkedAccount:";

// The storage event only fires in OTHER tabs, so same-tab completion notifies
// subscribers directly.
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

function accountKey(prefix: string, evmAddress: string | null | undefined): string | null {
  return evmAddress ? `${prefix}${evmAddress.toLowerCase()}` : null;
}

function readFlag(key: string | null): boolean {
  if (!key) return false;
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function writeFlag(key: string | null): void {
  if (!key) return;
  try {
    window.localStorage.setItem(key, "1");
  } catch {
    // Storage refused (private mode, quota). Whatever this flag would have
    // hidden simply shows once more, which is the safe direction.
  }
  notify();
}

function clearFlag(key: string | null): void {
  if (!key) return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Storage unavailable: nothing was stored to clear.
  }
  notify();
}

export function markMigrationComplete(evmAddress: string | null | undefined): void {
  writeFlag(accountKey(MIGRATION_COMPLETE_PREFIX, evmAddress));
}

// Re-opens the one-click door, for when a later bank deposit or a settled
// window puts money back in the old wallet.
export function clearMigrationComplete(evmAddress: string | null | undefined): void {
  clearFlag(accountKey(MIGRATION_COMPLETE_PREFIX, evmAddress));
}

export function isMigrationComplete(evmAddress: string | null | undefined): boolean {
  return readFlag(accountKey(MIGRATION_COMPLETE_PREFIX, evmAddress));
}

export function markFundsMoved(evmAddress: string | null | undefined): void {
  writeFlag(accountKey(FUNDS_MOVED_PREFIX, evmAddress));
}

export function hasMovedFunds(evmAddress: string | null | undefined): boolean {
  return readFlag(accountKey(FUNDS_MOVED_PREFIX, evmAddress));
}

export function hasLocalPrivyHistory(): boolean {
  try {
    return PRIVY_SESSION_KEYS.some((key) => window.localStorage.getItem(key) !== null);
  } catch {
    return false;
  }
}

// The device-only decision, with no server knowledge.
export function shouldOfferMigration(evmAddress: string | null | undefined): boolean {
  return !isMigrationComplete(evmAddress) && hasLocalPrivyHistory();
}

/** What a signed-in account can be recognised by. Either half may be absent. */
export interface LinkedIdentity {
  email?: string | null;
  evmAddress?: string | null;
}

function linkedKeys(identity: LinkedIdentity): string[] {
  const email = identity.email?.trim().toLowerCase();
  return [
    ...(email ? [`${LINKED_EMAIL_PREFIX}${email}`] : []),
    ...(identity.evmAddress
      ? [`${LINKED_ACCOUNT_PREFIX}${identity.evmAddress.toLowerCase()}`]
      : []),
  ];
}

// Has this device already confirmed this account is linked, by any identifier
// it has. False with nothing to key on, or when storage is unavailable —
// either way the caller falls back to asking the service, which is never
// wrong, only slower.
export function isAccountLinked(identity: LinkedIdentity): boolean {
  return linkedKeys(identity).some(readFlag);
}

// Record that this account is linked, under every identifier it has. Only ever
// called once the fact is confirmed (see LINKED_EMAIL_PREFIX), never
// speculatively.
export function markAccountLinked(identity: LinkedIdentity): void {
  const keys = linkedKeys(identity);
  if (keys.length === 0) return;
  for (const key of keys) {
    try {
      window.localStorage.setItem(key, "1");
    } catch {
      // Storage refused: the account is simply re-checked next load, which is
      // correct, just not free.
    }
  }
  notify();
}

// The full decision. Pure, so every arm is tested.
export function offerMigration(input: {
  complete: boolean;
  localHistory: boolean;
  status: MigrationStatus | undefined;
  /**
   * The device remembers this account as linked (see markAccountLinked),
   * so it can be known before /status returns. It is a memory, not authority:
   * a live `linked: false` from the service outranks it, the same way it
   * outranks the device's "complete" flag — an admin remap can undo a link.
   */
  linked?: boolean;
  /**
   * The signed-in identity belongs to a legacy account — see useLegacyAccount.
   * Whether that account's WALLET holds anything is deliberately not part of
   * this decision.
   */
  legacyAccount?: boolean;
  /**
   * The directory answered, definitely, that this identity was never a legacy
   * user. Outranks the device's `privy:` keys, which belong to the browser,
   * not the person: a brand-new user on a browser someone else used with the
   * old app must never be told to move to Market 2.0.
   */
  legacyKnownAbsent?: boolean;
  /**
   * The frontend's own read of the old wallet:
   *   true  — holds money,     false — confirmed empty,
   *   null  — could not read,  undefined — the read is still in flight.
   * For a linked account only `true` opens the offer. For an unlinked one a
   * known value outranks the service's `hasLegacyFunds`.
   */
  walletFunds?: boolean | null;
}): boolean {
  // The service's own answer wins whenever it gives one. The device's memory
  // only fills the gap it leaves (not loaded, or could not say).
  const linked =
    input.status?.linked === true || (input.linked === true && input.status?.linked !== false);

  // Linked means the identity has moved. The one thing that can still bring
  // the offer back is money PROVEN to be sitting on the old wallet: a chain
  // read that came back complete and saw it. Nothing weaker counts — not the
  // service's `hasLegacyFunds` (it also fires while a ledger re-key is
  // pending), not a partial read (it proves nothing either way), not a read
  // still in flight, not a deposit that has not landed yet. Until the wallet
  // is seen to hold something, a linked account is left alone.
  if (linked) return input.walletFunds === true;

  // Not (yet) known linked. Until the service has answered we cannot tell a
  // migrated account from a legacy one, so we wait rather than flash the offer
  // on and then off once the answer lands.
  if (input.status === undefined) return false;

  // ── the account is not linked ──
  //
  // Money still on the old wallet, or a deposit still landing there, keeps the
  // offer open no matter what else is true.
  const fundsOnChain = input.walletFunds ?? null;
  const fundsLeft = fundsOnChain !== null ? fundsOnChain : Boolean(input.status.hasLegacyFunds);
  if (fundsLeft || input.status.pendingOnramps.length) return true;
  // Definitely never a legacy user. Nothing below can be a reason.
  if (input.legacyKnownAbsent) return false;
  // Marked done on this device. That flag only fills the gap the service leaves
  // (could not say): when the service has answered "not linked", its answer
  // wins. The flag is per DEVICE, not per user, and can be set by a sweep whose
  // link never landed — so localStorage never gets to overrule a live "no".
  if (input.complete && input.status.linked !== false) return false;

  // Anything below means "still on the old identity".
  //
  // An empty wallet is NOT a reason to stay quiet. The sweep moves tokens; the
  // re-key moves the profile, the followers, the posts, the chess ledgers, the
  // kash points and tier — none of which a balance can see. A user with $0 and
  // four years of history has the most to lose by never linking.
  if (input.localHistory) return true;
  if (input.legacyAccount) return true;
  return false;
}

// Whether to hide the balance figure. Only while the old account still holds
// everything: once any of it has landed, the number is real money the user
// can see, even though more may still be on its way.
export function maskBalance(input: { offer: boolean; moved: boolean }): boolean {
  return input.offer && !input.moved;
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

// SSR sees no flag; the store corrects it on hydration.
export function useMigrationCompleteFlag(evmAddress: string | null | undefined): boolean {
  return useSyncExternalStore(
    subscribe,
    () => isMigrationComplete(evmAddress),
    () => false
  );
}

export function useLocalPrivyHistory(): boolean {
  return useSyncExternalStore(subscribe, hasLocalPrivyHistory, () => false);
}

export function useFundsMoved(evmAddress: string | null | undefined): boolean {
  return useSyncExternalStore(
    subscribe,
    () => hasMovedFunds(evmAddress),
    () => false
  );
}

// Reactive read of the remembered-linked flag. Flips to true the moment
// markAccountLinked runs (same tab), so the offer can short-circuit without a
// reload.
export function useAccountLinked(identity: LinkedIdentity): boolean {
  const { email, evmAddress } = identity;
  return useSyncExternalStore(
    subscribe,
    () => isAccountLinked({ email, evmAddress }),
    () => false
  );
}
