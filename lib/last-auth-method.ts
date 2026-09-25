"use client";

import { useSyncExternalStore } from "react";

// Which sign-in method this browser last completed, so a returning visitor is
// offered that one method instead of the whole menu. Convenience only: it is
// display state, never an auth decision, and being wrong costs the user one
// tap on "use a different account".
//
// Recorded in two steps on purpose. The auth components call rememberPending()
// when they *attempt* a method; the auth page calls promotePending() once a
// session actually lands, so an abandoned or failed attempt never becomes the
// remembered method.
//
// Deliberately separate from recordAuthMethod() in ./analytics/auth-method:
// that one is a one-shot in-memory channel owned by AnalyticsIdentity, and
// folding the two together would have this module consume its value.

export type LastAuthMethod = "google" | "kingschat" | "email" | "passkey" | "x";

const KEY = "ws.lastAuthMethod";

const isMethod = (value: string | null): value is LastAuthMethod =>
  value === "google" ||
  value === "kingschat" ||
  value === "email" ||
  value === "passkey" ||
  value === "x";

let pending: LastAuthMethod | null = null;

export function rememberPending(method: LastAuthMethod): void {
  pending = method;
}

export function promotePending(): void {
  if (!pending) return;
  try {
    window.localStorage.setItem(KEY, pending);
  } catch {
    // Private mode or quota — the returning-user shortcut simply never appears.
  }
  pending = null;
}

export function readLastAuthMethod(): LastAuthMethod | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    return isMethod(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function clearLastAuthMethod(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // Nothing to clear when storage is unavailable.
  }
}

// The storage event fires in OTHER tabs only, which is all this needs: the
// value changes in this tab exactly once, on a sign-in that navigates away.
function subscribe(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

// SSR renders the full method list; the store corrects it on hydration.
export function useLastAuthMethod(): LastAuthMethod | null {
  return useSyncExternalStore(subscribe, readLastAuthMethod, () => null);
}
