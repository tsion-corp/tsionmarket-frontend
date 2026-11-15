/**
 * What counts as an acceptable wallet passphrase, and how it is normalised.
 *
 * The passphrase is the only thing between a stolen ciphertext and the keys, so
 * it is checked at creation. The stretching (Argon2id) makes each guess costly;
 * length and variety make the number of guesses large. This is a baseline, not
 * a strength estimator: it rejects the obviously weak, and the interface should
 * encourage a long phrase rather than a short complicated one.
 */

export const MIN_PASSPHRASE_LENGTH = 12;
const MIN_DISTINCT_CHARACTERS = 6;

// A few of the most common phrases that clear the length floor. Not exhaustive.
const COMMON = new Set([
  "passwordpassword",
  "password1234",
  "password12345",
  "123456789012",
  "1234567890123",
  "qwertyuiopas",
  "qwertyuiop123",
  "iloveyou1234",
  "letmein12345",
  "welcome12345",
  "administrator",
  "abcdefghijkl",
]);

/**
 * NFKC, and nothing else. NOT trimmed: leading and trailing spaces are part of
 * what the person typed, and silently dropping them would make the same
 * passphrase differ between devices. NFKC makes visually identical input (a
 * composed or decomposed accent, a full-width digit) derive the same key.
 */
export function normalizePassphrase(raw: string): string {
  return raw.normalize("NFKC");
}

export type PassphraseCheck =
  { ok: true } | { ok: false; reason: "too_short" | "too_common" | "too_repetitive" | "sequence" };

const length = (text: string) => [...text].length;

function isSequence(text: string): boolean {
  const codes = [...text].map((ch) => ch.codePointAt(0)!);
  if (codes.length < 6) return false;
  const step = codes[1]! - codes[0]!;
  if (Math.abs(step) !== 1) return false;
  return codes.every((code, i) => i === 0 || code - codes[i - 1]! === step);
}

export function checkPassphrase(raw: string): PassphraseCheck {
  const text = normalizePassphrase(raw);
  if (length(text) < MIN_PASSPHRASE_LENGTH) return { ok: false, reason: "too_short" };
  if (COMMON.has(text.toLowerCase().replace(/\s+/g, "")))
    return { ok: false, reason: "too_common" };
  if (new Set([...text.toLowerCase()]).size < MIN_DISTINCT_CHARACTERS) {
    return { ok: false, reason: "too_repetitive" };
  }
  if (isSequence(text.toLowerCase())) return { ok: false, reason: "sequence" };
  return { ok: true };
}

export class WeakPassphraseError extends Error {
  constructor(readonly reason: Exclude<PassphraseCheck, { ok: true }>["reason"]) {
    super("That passphrase is too weak.");
    this.name = "WeakPassphraseError";
  }
}

export function assertStrongPassphrase(raw: string): void {
  const result = checkPassphrase(raw);
  if (!result.ok) throw new WeakPassphraseError(result.reason);
}

/** Plain-English reason for the interface to show. */
export function passphraseProblem(reason: WeakPassphraseError["reason"]): string {
  switch (reason) {
    case "too_short":
      return `Use at least ${MIN_PASSPHRASE_LENGTH} characters. A few ordinary words strung together works well.`;
    case "too_common":
      return "That is one of the first phrases anyone would try. Choose something only you would think of.";
    case "too_repetitive":
      return "That repeats too few different characters. Make it longer and more varied.";
    case "sequence":
      return "A run like 123456 or abcdef is easy to guess. Choose something less predictable.";
  }
}
