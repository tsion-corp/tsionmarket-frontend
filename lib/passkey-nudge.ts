"use client";

import { useSyncExternalStore } from "react";

// When to re-offer "add a passkey" to a device that fell back to a PIN.
//
// The offer is worth making more than once — the usual reason a device is on a
// PIN is that a password manager happened to be unreachable at wallet-creation
// time, and that changes. It is not worth making every sign-in, which is how a
// useful prompt becomes one people dismiss without reading.

const KEY = "ws.passkeyNudgeDeclinedAt";
const REOFFER_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

export function passkeyNudgeDue(): boolean {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return true;
    const at = Number(raw);
    // An unparseable value means the record is useless, so treat it as absent
    // rather than suppressing the offer forever.
    return !Number.isFinite(at) || Date.now() - at > REOFFER_AFTER_MS;
  } catch {
    // Storage unavailable: offer it. A repeated prompt beats a device that
    // silently never gets one.
    return true;
  }
}

export function recordPasskeyNudgeDeclined(): void {
  try {
    window.localStorage.setItem(KEY, String(Date.now()));
  } catch {
    // Nothing to record against; the offer simply comes back next time.
  }
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

// SSR has no localStorage, so the server renders "not due" and the client
// corrects it on hydration — the offer only ever applies to a signed-in
// session, which is client-only anyway.
export function usePasskeyNudgeDue(): boolean {
  return useSyncExternalStore(subscribe, passkeyNudgeDue, () => false);
}
