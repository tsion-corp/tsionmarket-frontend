// Persists the user's chosen interest so the dashboard can shape itself around it.
// Client-safe and UI-free: importable from server-rendered modules without side effects.

const INTEREST_KEY = "ws.interest.v1";

export function saveInterest(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(INTEREST_KEY, key);
  } catch {
    // Storage can be unavailable (private mode, quota). The choice is a
    // nice-to-have preference, so losing it is acceptable.
  }
}

export function loadInterest(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(INTEREST_KEY);
  } catch {
    return null;
  }
}

export function clearInterest(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(INTEREST_KEY);
  } catch {
    // Nothing to do: if storage is unavailable there is nothing stored.
  }
}
