import { entropyToMnemonic, mnemonicToEntropy, mnemonicToSeedSync } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english";
import { randomBytes } from "./encoding";

/**
 * The recovery phrase: the wallet's one root secret.
 *
 * It is a standard BIP-39 phrase, so the same words restore the keys in any
 * other wallet (Phantom, MetaMask and so on), and they are also what unlocks
 * the encrypted copy kept in the cloud if the passphrase is forgotten. One
 * phrase to write down, not two.
 *
 * New wallets get 24 words (256 bits). Importing an existing wallet accepts
 * 12, 15, 18, 21 or 24. The optional BIP-39 "25th word" is never used, so the
 * phrase alone is enough everywhere.
 */

export const ENTROPY_LENGTHS = [16, 20, 24, 28, 32] as const;
export const NEW_PHRASE_WORDS = 24;
const WORD_COUNTS = [12, 15, 18, 21, 24];

export class PhraseFormatError extends Error {
  constructor() {
    super("That recovery phrase is not valid. Check each word and the order.");
    this.name = "PhraseFormatError";
  }
}

export interface Phrase {
  words: Array<string>;
  /** The phrase as raw bytes (16 to 32). A secret: wipe it when done. */
  entropy: Uint8Array;
}

export function isValidEntropyLength(length: number): boolean {
  return (ENTROPY_LENGTHS as ReadonlyArray<number>).includes(length);
}

export function entropyToWords(entropy: Uint8Array): Array<string> {
  if (!isValidEntropyLength(entropy.length)) throw new PhraseFormatError();
  return entropyToMnemonic(entropy, wordlist).split(" ");
}

/** A fresh phrase from the platform CSPRNG. */
export function generatePhrase(wordCount: 12 | 24 = NEW_PHRASE_WORDS): Phrase {
  const entropy = randomBytes(wordCount === 24 ? 32 : 16);
  return { words: entropyToWords(entropy), entropy };
}

/**
 * Read a phrase a person typed or pasted: any spacing and case, 12 to 24
 * words. The checksum is verified, so a mistyped or swapped word is rejected
 * instead of quietly producing a different wallet.
 */
export function parsePhrase(input: string | ReadonlyArray<string>): Phrase {
  const text = (typeof input === "string" ? input : input.join(" "))
    .normalize("NFKD")
    .trim()
    .toLowerCase();
  const words = text.split(/\s+/).filter(Boolean);
  if (!WORD_COUNTS.includes(words.length)) throw new PhraseFormatError();
  try {
    const entropy = mnemonicToEntropy(words.join(" "), wordlist);
    return { words, entropy };
  } catch {
    throw new PhraseFormatError();
  }
}

/** The 64-byte BIP-39 seed (empty passphrase), from which every key is derived. */
export function seedFromEntropy(entropy: Uint8Array): Uint8Array {
  if (!isValidEntropyLength(entropy.length)) throw new PhraseFormatError();
  return mnemonicToSeedSync(entropyToMnemonic(entropy, wordlist), "");
}

/**
 * Which words to ask the person to re-enter, to prove they wrote the phrase
 * down before the wallet counts as backed up. Distinct positions, chosen with
 * rejection sampling so no position is favoured.
 */
export function pickConfirmationPositions(
  count = 3,
  total = NEW_PHRASE_WORDS,
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

export function confirmPhraseWords(
  words: ReadonlyArray<string>,
  positions: ReadonlyArray<number>,
  answers: ReadonlyArray<string>
): boolean {
  return (
    positions.length === answers.length &&
    positions.every((position, i) => words[position] === answers[i]?.trim().toLowerCase())
  );
}
