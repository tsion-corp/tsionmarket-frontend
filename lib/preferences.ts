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

// Remembers that a passkey was created or used on this device. The auth page
// only offers passkey sign-in when this is set, so first-time visitors never
// hit an empty passkey picker.
const PASSKEY_DEVICE_KEY = "ws.passkeyDevice.v1";

export function markPasskeyDevice(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PASSKEY_DEVICE_KEY, "1");
  } catch {
    // Losing the hint only means the passkey button stays hidden here.
  }
}

export function hasPasskeyDevice(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(PASSKEY_DEVICE_KEY) === "1";
  } catch {
    return false;
  }
}
