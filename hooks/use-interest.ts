"use client";

import { useSyncExternalStore } from "react";
import { loadInterest } from "@/lib/preferences";

const INTEREST_EVENT = "ws:interest";

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(INTEREST_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(INTEREST_EVENT, onChange);
  };
}

/**
 * The interest chosen at onboarding, as saved in this browser, or null.
 *
 * Read through useSyncExternalStore with a null server snapshot, so the first
 * paint on the client matches the server's and whatever the interest shapes
 * appears after hydration rather than mismatching it. Follows a change made in
 * another tab through the storage event, and one made in this tab when the
 * interests page announces it.
 */
export function useInterest(): string | null {
  return useSyncExternalStore(subscribe, loadInterest, () => null);
}

/** Tells this tab's readers that the saved interest changed. */
export function announceInterestChange(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(INTEREST_EVENT));
}
