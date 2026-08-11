// Client-side persistence for a Pouch Shared KYC session. After the email OTP
// succeeds, Pouch returns a JWT that authorizes KYC submission and every later
// onramp for about a month. Persisting it is what makes the KYC one-time: a
// verified user funds again without re-verifying. UI-free and client-safe,
// mirroring lib/preferences.ts. The token authorizes only this user's KYC and
// ramps, never anything app-wide.

import type { KycState } from "@/features/funds/lib/kyc";

const KEY = "ws.pouch.kyc.v1";

export interface KycSession {
  email: string;
  // ISO alpha-2 uppercase, as sent to Pouch.
  countryCode: string;
  token: string;
  // ISO timestamp when the token stops being valid.
  expiresAt: string;
  // Last known state, re-confirmed against the API before it is acted on.
  state: KycState;
}

function isSession(value: unknown): value is KycSession {
  if (!value || typeof value !== "object") return false;
  const s = value as Record<string, unknown>;
  return (
    typeof s.email === "string" &&
    typeof s.countryCode === "string" &&
    typeof s.token === "string" &&
    typeof s.expiresAt === "string" &&
    typeof s.state === "string"
  );
}

export function loadKycSession(): KycSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return isSession(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveKycSession(session: KycSession): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(session));
  } catch {
    // Storage can be unavailable (private mode, quota). The user can still
    // complete KYC now; they just will not skip it next time.
  }
}

export function updateKycSession(patch: Partial<KycSession>): void {
  const current = loadKycSession();
  if (!current) return;
  saveKycSession({ ...current, ...patch });
}

export function clearKycSession(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // Nothing to do: if storage is unavailable there is nothing stored.
  }
}

// A session is usable while its token has not expired. A one-minute skew guards
// against a token that lapses mid-request.
export function isSessionActive(session: KycSession | null): session is KycSession {
  if (!session) return false;
  const expires = Date.parse(session.expiresAt);
  if (Number.isNaN(expires)) return false;
  return expires - 60_000 > Date.now();
}

// The user can fund without re-verifying only when the session is live and
// already approved.
export function isReusableSession(session: KycSession | null): session is KycSession {
  return isSessionActive(session) && session.state === "approved";
}
