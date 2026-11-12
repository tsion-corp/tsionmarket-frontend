import { sha256 } from "@noble/hashes/sha2";
import { randomBytes, utf8 } from "./encoding";

/**
 * The recovery secret: 32 random bytes that unlock the wallet if the passphrase is
 * forgotten or the device is lost.
 *
 * It is NOT the wallet's keys. The keys are random and sealed in the package; this
 * secret only opens the envelope that holds the key to that seal. So the secret on
 * its own is no use to a thief (they would also need the encrypted package), and the
 * flip side is that it cannot be shown again and cannot be imported into another
 * wallet. It is shown once, when the wallet is made.
 *
 * Written for people: Crockford base32 (no I, L, O or U, so no look-alikes), in
 * groups of four, with a checksum, so a mistyped or swapped character is caught
 * rather than quietly producing a different secret.
 *
 *   ABCD-EFGH-JKMN-PQRS-TVWX-YZ01-2345-6789-ABCD-EFGH-JKMN-PQRS-TVWX-YZ01
 *   \____________________ 52 characters = 256 bits __________________/ \check/
 */

export const RECOVERY_SECRET_BYTES = 32;
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const DATA_CHARS = 52; // 256 bits as 5-bit symbols; the last symbol carries 4 spare zero bits
const CHECK_CHARS = 4; // 20 bits of checksum
const GROUP_SIZE = 4;
export const RECOVERY_SECRET_GROUPS = (DATA_CHARS + CHECK_CHARS) / GROUP_SIZE; // 14
const CHECK_DOMAIN = "tsion-recovery-secret-check:v1";

export class RecoverySecretFormatError extends Error {
  constructor() {
    super("That recovery secret is not valid. Check each group and try again.");
    this.name = "RecoverySecretFormatError";
  }
}

/** A fresh secret from the platform CSPRNG. */
export function generateRecoverySecret(): Uint8Array {
  return randomBytes(RECOVERY_SECRET_BYTES);
}

/** The bytes as 5-bit symbols, most significant first, padded with zero bits. */
function toSymbols(bytes: Uint8Array): number[] {
  const symbols: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      symbols.push((buffer >> (bits - 5)) & 31);
      bits -= 5;
    }
    buffer &= (1 << bits) - 1;
  }
  if (bits > 0) symbols.push((buffer << (5 - bits)) & 31);
  return symbols;
}

function checkSymbols(secret: Uint8Array): number[] {
  const digest = sha256(Uint8Array.from([...utf8(CHECK_DOMAIN), ...secret]));
  return toSymbols(digest.slice(0, 3)).slice(0, CHECK_CHARS);
}

/** The secret as it is shown and written down: 14 groups of four, with the checksum. */
export function encodeRecoverySecret(secret: Uint8Array): string {
  if (secret.length !== RECOVERY_SECRET_BYTES) throw new RecoverySecretFormatError();
  const chars = [...toSymbols(secret), ...checkSymbols(secret)].map((value) => ALPHABET[value]);
  const groups: string[] = [];
  for (let i = 0; i < chars.length; i += GROUP_SIZE)
    groups.push(chars.slice(i, i + GROUP_SIZE).join(""));
  return groups.join("-");
}

/** The groups, in order, for showing a grid or asking for some back. */
export const recoverySecretGroups = (secret: Uint8Array): string[] =>
  encodeRecoverySecret(secret).split("-");

/** Case, spacing, dashes and the look-alikes Crockford folds together (O is 0, I and L are 1). */
function normalize(input: string): string {
  return input
    .toUpperCase()
    .replace(/[\s\-_.]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");
}

/**
 * Read a secret a person typed or pasted. Anything that is not exactly one valid
 * secret (wrong length, a character outside the alphabet, spare bits set, a bad
 * checksum) is rejected, never repaired.
 */
export function parseRecoverySecret(input: string): Uint8Array {
  const text = normalize(input);
  if (text.length !== DATA_CHARS + CHECK_CHARS) throw new RecoverySecretFormatError();
  const values: number[] = [];
  for (const char of text) {
    const value = ALPHABET.indexOf(char);
    if (value < 0) throw new RecoverySecretFormatError();
    values.push(value);
  }

  const bytes = new Uint8Array(RECOVERY_SECRET_BYTES);
  let buffer = 0;
  let bits = 0;
  let index = 0;
  for (const value of values.slice(0, DATA_CHARS)) {
    buffer = (buffer << 5) | value;
    bits += 5;
    while (bits >= 8 && index < RECOVERY_SECRET_BYTES) {
      bytes[index++] = (buffer >> (bits - 8)) & 255;
      bits -= 8;
    }
    buffer &= (1 << bits) - 1;
  }
  // 52 symbols is 260 bits; the last 4 are padding and must be zero.
  if (index !== RECOVERY_SECRET_BYTES || buffer !== 0) throw new RecoverySecretFormatError();

  const expected = checkSymbols(bytes);
  if (!expected.every((value, i) => value === values[DATA_CHARS + i])) {
    throw new RecoverySecretFormatError();
  }
  return bytes;
}

/**
 * Which groups to ask the person to type back, to prove they copied the secret
 * down before the wallet counts as backed up. Distinct positions, chosen by
 * rejection sampling so no position is favoured.
 */
export function pickConfirmationPositions(
  count = 3,
  total = RECOVERY_SECRET_GROUPS,
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

export function confirmSecretGroups(
  groups: ReadonlyArray<string>,
  positions: ReadonlyArray<number>,
  answers: ReadonlyArray<string>
): boolean {
  return (
    positions.length === answers.length &&
    positions.every((position, i) => {
      const answer = normalize(answers[i] ?? "");
      return answer.length === GROUP_SIZE && answer === normalize(groups[position] ?? "");
    })
  );
}
