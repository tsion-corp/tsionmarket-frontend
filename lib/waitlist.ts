// Pure helpers for the pre-launch waitlist. Kept free of React and fetch so
// both the form and the API route validate an address exactly the same way —
// a client that trims and lowercases differently from the server would let
// duplicates through as distinct entries.

// Deliberately permissive: one @, a dot-bearing domain, no whitespace. Real
// deliverability is the mail provider's call, and a stricter pattern only
// rejects addresses that genuinely exist (plus tags, long TLDs, unicode).
const EMAIL = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

// The stored form of an address: trimmed and lowercased, so the same person
// signing up twice with different casing is one entry.
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isValidEmail(raw: string): boolean {
  const email = normalizeEmail(raw);
  return email.length <= 254 && EMAIL.test(email);
}
