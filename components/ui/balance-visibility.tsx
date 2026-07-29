"use client";

import { createContext, useCallback, useContext, useSyncExternalStore } from "react";

// Persisted so the choice survives reloads, per the lib/preferences pattern.
const STORAGE_KEY = "ws.hideBalance.v1";
const MASK = "••••••";

// A tiny external store over localStorage. Reading through useSyncExternalStore
// keeps the value SSR-safe (server renders "visible", the client reconciles the
// saved choice on hydration) with no setState-in-effect, and syncs across tabs.
const listeners = new Set<() => void>();

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

function readHidden(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeHidden(next: boolean): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
  } catch {
    // localStorage can throw in private mode; the notify below still updates UI.
  }
  listeners.forEach((cb) => cb());
}

interface BalanceVisibility {
  hidden: boolean;
  toggle: () => void;
  // Returns the masked placeholder when hidden, otherwise the value untouched.
  mask: (value: string) => string;
}

const Ctx = createContext<BalanceVisibility | null>(null);

// Holds the "hide my balances" toggle for the whole app. Any amount that should
// be maskable reads `mask()` from here, so one eye toggle hides every balance at
// once and the choice is remembered.
export function BalanceVisibilityProvider({ children }: { children: React.ReactNode }) {
  const hidden = useSyncExternalStore(subscribe, readHidden, () => false);
  const toggle = useCallback(() => writeHidden(!readHidden()), []);
  const mask = useCallback((value: string) => (hidden ? MASK : value), [hidden]);

  return <Ctx.Provider value={{ hidden, toggle, mask }}>{children}</Ctx.Provider>;
}

export function useBalanceVisibility(): BalanceVisibility {
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error("useBalanceVisibility must be used within BalanceVisibilityProvider");
  }
  return ctx;
}
