import { entropyToMnemonic, mnemonicToEntropy } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english";
import { fromBase64Url, randomBytes, toBase64Url } from "./encoding";
import { RECOVERY_SECRET_BYTES } from "./envelope";

/**
 * How a recovery secret is shown to a person and read back.
 *
 * The secret is 32 random bytes. It can be written down two ways, and either
 * is accepted: 43 characters of base64url, or 24 ordinary words (the same
 * bytes as a standard 24-word list, with its built-in checksum). Words are far
 * easier to copy onto paper without a mistake, and a mistyped word is caught
 * by the checksum instead of silently producing a different secret.
 */

export const RECOVERY_WORD_COUNT = 24;

export class RecoverySecretFormatError extends Error {
  constructor() {
    super("That recovery secret is not valid. Check for a typo or a missing word.");
    this.name = "RecoverySecretFormatError";
  }
}

export const recoverySecretToBase64Url = (secret: Uint8Array): string => toBase64Url(secret);

export function recoverySecretToWords(secret: Uint8Array): Array<string> {
  if (secret.length !== RECOVERY_SECRET_BYTES) throw new RecoverySecretFormatError();
  return entropyToMnemonic(secret, wordlist).split(" ");
}

/** Accepts the 24 words (any spacing or case) or the 43-character form. */
export function parseRecoverySecret(input: string): Uint8Array {
  const text = input.trim();
  try {
    if (/\s/.test(text)) {
      const words = text.toLowerCase().split(/\s+/);
      if (words.length !== RECOVERY_WORD_COUNT) throw new RecoverySecretFormatError();
      const entropy = mnemonicToEntropy(words.join(" "), wordlist);
      if (entropy.length !== RECOVERY_SECRET_BYTES) throw new RecoverySecretFormatError();
      return entropy;
    }
    const bytes = fromBase64Url(text);
    if (bytes.length !== RECOVERY_SECRET_BYTES) throw new RecoverySecretFormatError();
    return bytes;
  } catch {
    throw new RecoverySecretFormatError();
  }
}

/**
 * Which words to ask the person to re-enter, to prove they wrote the secret
 * down before the wallet is considered backed up. Distinct positions, chosen
 * with rejection sampling so no position is favoured.
 */
export function pickConfirmationPositions(
  count = 3,
  total = RECOVERY_WORD_COUNT,
  random: (length: number) => Uint8Array = randomBytes
): Array<number> {
  const limit = 256 - (256 % total);
  const picked = new Set<number>();
  while (picked.size < count) {
    for (const byte of random(16)) {
      if (byte < limit) picked.add(byte % total);
      if (picked.size === count) break;
    }
  }
  return [...picked].sort((a, b) => a - b);
}

export function confirmRecoveryWords(
  words: ReadonlyArray<string>,
  positions: ReadonlyArray<number>,
  answers: ReadonlyArray<string>
): boolean {
  return (
    positions.length === answers.length &&
    positions.every((position, i) => words[position] === answers[i]?.trim().toLowerCase())
  );
}
