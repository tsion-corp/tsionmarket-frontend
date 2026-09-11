// What the person agreed to on the sign in page, remembered on this device
// and recorded on their account once they have one.
//
// Two answers are collected before any sign in method is pressed: that they
// accept the Terms of Service and the Privacy Policy, which every method
// requires, and whether they want product email, which is optional. Both
// boxes are offered ticked; unticking the terms disables every sign in
// method and says why. Both answers are kept in local storage so they
// survive the round trip an OAuth sign in makes, and so a returning person
// on the same device sees what they chose.
//
// An offered tick is not an acceptance. The acceptance is stamped the moment
// the person proceeds with the box ticked, which is when the sign in
// completes and the answers are recorded.
//
// Held in a small external store rather than component state so the page
// can read it with useSyncExternalStore: the server renders the empty answer
// and the client swaps in the stored one after hydration, with no mismatch.
//
// Once the sign in completes the answers are sent to POST /api/consent,
// which records them on the account; `recordedFor` remembers which account
// they were recorded on so a reload does not send them twice.

import { apiFetch } from "@/lib/api";

const STORAGE_KEY = "wsws.consent.v1";

/** The date on the Terms of Service the acceptance refers to. */
export const TERMS_VERSION = "2026-09-10";

export interface Consent {
  terms: boolean;
  marketing: boolean;
  /** ISO time the terms were accepted, set when `terms` first becomes true. */
  acceptedAt: string | null;
  /** The terms version accepted, so a new version can ask again. */
  termsVersion: string | null;
  /** The account id these answers were recorded on, if any. */
  recordedFor: string | null;
}

export const EMPTY_CONSENT: Consent = {
  terms: false,
  marketing: false,
  acceptedAt: null,
  termsVersion: null,
  recordedFor: null,
};

/** What the page offers before anything is stored: both boxes ticked. */
export const DEFAULT_CONSENT: Consent = {
  terms: true,
  marketing: true,
  acceptedAt: null,
  termsVersion: null,
  recordedFor: null,
};

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function readConsent(): Consent {
  const store = storage();
  if (!store) return DEFAULT_CONSENT;
  try {
    const raw = store.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_CONSENT;
    const parsed = JSON.parse(raw) as Partial<Consent>;
    // An acceptance of an older version of the terms does not carry over: the
    // box is offered ticked again and a fresh acceptance is stamped when they
    // proceed. Only an explicit untick of the current version stays unticked.
    const current = parsed.termsVersion === TERMS_VERSION;
    const accepted = parsed.terms === true && current;
    const terms = accepted || !current;
    return {
      terms,
      marketing: parsed.marketing !== false,
      acceptedAt: accepted && typeof parsed.acceptedAt === "string" ? parsed.acceptedAt : null,
      termsVersion: accepted ? TERMS_VERSION : null,
      recordedFor: typeof parsed.recordedFor === "string" ? parsed.recordedFor : null,
    };
  } catch {
    return DEFAULT_CONSENT;
  }
}

export function writeConsent(next: Consent): void {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Private mode or a full store. The page keeps the choice for this visit.
  }
}

/** The stored consent with the two choices applied; stamps a fresh acceptance. */
export function updateConsent(
  current: Consent,
  choice: { terms: boolean; marketing: boolean },
  now = new Date()
): Consent {
  const accepted = choice.terms;
  // Unticking the terms must be remembered as a choice of this version, so a
  // reload does not offer the box ticked again as if nothing had been said.
  return {
    terms: accepted,
    marketing: choice.marketing,
    acceptedAt: accepted ? (current.acceptedAt ?? now.toISOString()) : null,
    termsVersion: TERMS_VERSION,
    // A changed answer has to be recorded again.
    recordedFor:
      choice.marketing === current.marketing && choice.terms === current.terms
        ? current.recordedFor
        : null,
  };
}

// The store the page subscribes to.
let current: Consent | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function subscribeConsent(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The current answers; read from storage on first access, never at import. */
export function consentSnapshot(): Consent {
  if (current === null) current = readConsent();
  return current;
}

/** The offered answers on the server, so the markup matches the first client paint. */
export function consentServerSnapshot(): Consent {
  return DEFAULT_CONSENT;
}

/** Applies a choice from the checkboxes, stores it, and tells subscribers. */
export function setConsent(choice: { terms: boolean; marketing: boolean }): void {
  current = updateConsent(consentSnapshot(), choice);
  writeConsent(current);
  emit();
}

/** Marks the answers as recorded on `userId`, so they are not sent again. */
export function markConsentRecorded(userId: string): void {
  current = { ...consentSnapshot(), recordedFor: userId };
  writeConsent(current);
  emit();
}

/** Forgets the in-memory copy, for tests that change the stored value. */
export function resetConsentStore(): void {
  current = null;
}

/** The body POST /api/consent takes. */
export interface ConsentRecord {
  terms: boolean;
  termsVersion: string;
  acceptedAt: string;
  marketing: boolean;
}

/**
 * Records this device's answers on the signed in account, once per account.
 *
 * Called when a sign in completes. A box left ticked as offered is accepted
 * here, at the moment they proceeded, and stamped with that time. Nothing to
 * send when the terms were unticked (the buttons were disabled, so this is a
 * returning session from a device that agreed earlier) or when this account
 * already has these answers. A failure is logged and left for the next sign
 * in; it never blocks the person from getting to the app.
 */
export async function recordConsent(userId: string): Promise<boolean> {
  let consent = consentSnapshot();
  if (!consent.terms || consent.recordedFor === userId) return false;
  if (!consent.acceptedAt) {
    consent = updateConsent(consent, { terms: true, marketing: consent.marketing });
    current = consent;
    writeConsent(consent);
    emit();
  }
  const body: ConsentRecord = {
    terms: true,
    termsVersion: TERMS_VERSION,
    acceptedAt: consent.acceptedAt as string,
    marketing: consent.marketing,
  };
  try {
    const res = await apiFetch(
      "/api/consent",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
      { requireAuth: true }
    );
    if (!res.ok) {
      console.warn("[consent] not recorded:", res.status);
      return false;
    }
    markConsentRecorded(userId);
    return true;
  } catch (error) {
    console.warn("[consent] not recorded:", error);
    return false;
  }
}
