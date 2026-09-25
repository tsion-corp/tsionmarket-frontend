"use client";

import { useSyncExternalStore } from "react";

// Who to greet the user as. Decane deliberately stores no profile server-side
// (only an HMAC and a masked identifier), so the name exists ONLY at the
// moment of sign-in: Google returns it once via the redirect URL, email
// sign-in has no name at all, and a restored session carries just addresses.
// Anything we want to keep showing after a reload we must persist ourselves,
// which is exactly what this module does. Display only: never key an account,
// a lookup, or access on any of these fields.

export interface DisplayProfile {
  name?: string;
  email?: string;
  picture?: string;
  /**
   * The handle, for a provider that has one instead of an address. An X
   * account releases no email, so this is the only human-readable thing it
   * gives. Display only — a handle can be released and re-registered.
   */
  username?: string;
  /**
   * The provider's stable id for this user — X's numeric user id. Unlike a
   * handle it cannot be reassigned, so it is the value to match a legacy
   * account against (see features/migrate/hooks/use-legacy-account).
   *
   * Kept here for the same reason the email is: the kit hands it back once, at
   * sign-in, and a session restored from a reload carries only addresses.
   */
  providerSubject?: string;
}

const KEY = "ws.displayProfile";

// The storage event only fires in OTHER tabs; same-tab writes notify directly.
const listeners = new Set<() => void>();

// getSnapshot must hand back a referentially stable value or
// useSyncExternalStore loops, so the parse is cached on the raw string.
let cache: { raw: string | null; parsed: DisplayProfile | null } = { raw: null, parsed: null };

function notify(): void {
  listeners.forEach((listener) => listener());
}

export function readDisplayProfile(): DisplayProfile | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw === null) return null;
    if (raw !== cache.raw) cache = { raw, parsed: JSON.parse(raw) as DisplayProfile };
    return cache.parsed;
  } catch {
    return null;
  }
}

// Merges rather than replaces, so an email sign-in (which only knows the
// email) does not erase the name a Google sign-in stored earlier.
export function rememberDisplayProfile(profile: DisplayProfile): void {
  try {
    const merged = { ...readDisplayProfile(), ...profile };
    window.localStorage.setItem(KEY, JSON.stringify(merged));
  } catch {
    // Storage unavailable: greetings fall back to the wallet identity.
  }
  notify();
}

// Called on sign-out, or the next user on this device sees the last one's name.
export function clearDisplayProfile(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // Nothing stored anywhere reachable, so nothing to leak.
  }
  notify();
}

// Decane's Google sign-in returns to the app with the profile in the query
// string (decane_name / decane_email / decane_picture) beside decane_jwt. The
// kit consumes those params and strips the URL, but its hooks never expose
// the profile, so this captures it first. Must run before the kit's own init
// effect; a child component's effect qualifies, since children's effects run
// before their provider's. Harmless when the params are absent.
export function captureDisplayProfileFromUrl(): void {
  try {
    const params = new URLSearchParams(window.location.search);
    if (!params.get("decane_jwt")) return;
    const profile: DisplayProfile = {};
    const name = params.get("decane_name");
    const email = params.get("decane_email");
    const picture = params.get("decane_picture");
    const username = params.get("decane_username");
    const providerSubject = params.get("decane_provider_subject");
    if (name) profile.name = name;
    if (email) profile.email = email;
    if (picture) profile.picture = picture;
    if (username) profile.username = username;
    if (providerSubject) profile.providerSubject = providerSubject;
    if (Object.keys(profile).length > 0) rememberDisplayProfile(profile);
  } catch {
    // A malformed URL never blocks sign-in; the greeting just stays generic.
  }
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

// SSR renders no profile; the store corrects it on hydration.
export function useDisplayProfile(): DisplayProfile | null {
  return useSyncExternalStore(subscribe, readDisplayProfile, () => null);
}
