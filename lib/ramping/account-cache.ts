// The onramp payment account, remembered per device and per wallet.
//
// A ramping payment account is permanently payable: only its 30-minute rate
// lock lapses, after which transfers convert at the live rate. So once a user
// has one, asking the rail for another on every deposit is pure waste. The
// screen checks here first and only creates a fresh order when nothing usable
// is stored.
//
// Keyed by wallet, not just device: the account delivers to the wallet it was
// created for, and a device can hold more than one login. Reusing another
// wallet's account would pay the wrong person, which is why a lookup for a
// wallet with no entry returns null instead of someone else's account.

import type { PaymentAccount } from "@/lib/ramping/orders";

const KEY = "wsws.ramping.onramp-account.v1";

export interface CachedOnrampAccount {
  orderId: string;
  account: PaymentAccount;
  savedAt: number;
}

type Store = Record<string, CachedOnrampAccount>;

function isAccount(value: unknown): value is PaymentAccount {
  if (!value || typeof value !== "object") return false;
  const a = value as Record<string, unknown>;
  return (
    typeof a.accountNumber === "string" &&
    a.accountNumber !== "" &&
    typeof a.accountName === "string" &&
    typeof a.bankName === "string"
  );
}

function isEntry(value: unknown): value is CachedOnrampAccount {
  if (!value || typeof value !== "object") return false;
  const e = value as Record<string, unknown>;
  return (
    typeof e.orderId === "string" &&
    e.orderId !== "" &&
    isAccount(e.account) &&
    typeof e.savedAt === "number" &&
    Number.isFinite(e.savedAt)
  );
}

function read(): Store {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const store: Store = {};
    for (const [wallet, entry] of Object.entries(parsed)) {
      if (isEntry(entry)) store[wallet] = entry;
    }
    return store;
  } catch {
    return {};
  }
}

function write(store: Store): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    // Storage can be unavailable (private mode, quota). The account is then
    // simply requested again next time, which is where we started.
  }
}

export function loadCachedOnrampAccount(wallet: string): CachedOnrampAccount | null {
  if (!wallet) return null;
  return read()[wallet.toLowerCase()] ?? null;
}

export function saveCachedOnrampAccount(
  wallet: string,
  orderId: string,
  account: PaymentAccount
): void {
  if (!wallet || !orderId || !isAccount(account)) return;
  const store = read();
  store[wallet.toLowerCase()] = { orderId, account, savedAt: Date.now() };
  write(store);
}

// Drop one wallet's entry, for when its order turns out dead (purged upstream,
// or failed): the next deposit then starts from a fresh order.
export function clearCachedOnrampAccount(wallet: string): void {
  if (!wallet) return;
  const store = read();
  if (!(wallet.toLowerCase() in store)) return;
  delete store[wallet.toLowerCase()];
  write(store);
}
