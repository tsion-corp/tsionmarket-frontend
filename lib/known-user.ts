"use client";

import { useSyncExternalStore } from "react";

// Whether this browser has ever completed a sign-in, kept in localStorage so
// the landing page can greet a returning visitor with "Log in" instead of
// "Get started". A marketing hint only — never an auth decision.
const KEY = "ws.knownUser";

export function markKnownUser(): void {
  try {
    window.localStorage.setItem(KEY, "1");
  } catch {
    // Storage can be unavailable (private mode, quota); the landing page
    // simply keeps saying "Get started".
  }
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

function snapshot(): boolean {
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

// SSR renders the first-time wording; the store corrects it on hydration.
export function useIsKnownUser(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => false);
}
