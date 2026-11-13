import { ed25519 } from "@noble/curves/ed25519";

/**
 * Sign a Solana transaction, in its wire form, with an ed25519 seed.
 *
 * A transaction is `[signature count][64 bytes each][message]`. The message names the
 * accounts in order; the first `numRequiredSignatures` of them must sign, and the
 * signature goes in the slot matching this key's position. Every other slot is left
 * as it is (the fee-payer sponsor signs its own afterwards). A transaction that does
 * not list this key as a required signer is refused, never signed.
 */

const SIGNATURE_BYTES = 64;
const KEY_BYTES = 32;

export class SolanaTransactionError extends Error {
  constructor(message = "That isn't a Solana transaction this wallet can sign.") {
    super(message);
    this.name = "SolanaTransactionError";
  }
}

/** A Solana "short vec": a little-endian base-128 length of at most three bytes. */
function readShortVec(bytes: Uint8Array, offset: number): [value: number, next: number] {
  let value = 0;
  for (let i = 0; i < 3; i += 1) {
    const byte = bytes[offset + i];
    if (byte === undefined) throw new SolanaTransactionError();
    value |= (byte & 0x7f) << (7 * i);
    if ((byte & 0x80) === 0) return [value, offset + i + 1];
  }
  throw new SolanaTransactionError();
}

/**
 * Walk the rest of the message (blockhash, instructions, and for v0 the address table
 * lookups) and require it to end exactly where the bytes end. A message that is cut
 * short or has trailing bytes is not one this wallet will put a signature on.
 */
function assertMessageWellFormed(
  message: Uint8Array,
  afterAccounts: number,
  versioned: boolean
): void {
  const skip = (at: number, length: number): number => {
    const next = at + length;
    if (length < 0 || next > message.length) throw new SolanaTransactionError();
    return next;
  };
  let at = skip(afterAccounts, 32); // recent blockhash
  let count: number;
  [count, at] = readShortVec(message, at);
  for (let i = 0; i < count; i += 1) {
    at = skip(at, 1); // program id index
    let length: number;
    [length, at] = readShortVec(message, at);
    at = skip(at, length); // account indexes
    [length, at] = readShortVec(message, at);
    at = skip(at, length); // data
  }
  if (versioned) {
    [count, at] = readShortVec(message, at);
    for (let i = 0; i < count; i += 1) {
      at = skip(at, 32); // lookup table account
      let length: number;
      [length, at] = readShortVec(message, at);
      at = skip(at, length); // writable indexes
      [length, at] = readShortVec(message, at);
      at = skip(at, length); // readonly indexes
    }
  }
  if (at !== message.length) throw new SolanaTransactionError();
}

export function signSolanaTransactionBytes(transaction: Uint8Array, seed: Uint8Array): Uint8Array {
  if (seed.length !== 32) throw new SolanaTransactionError();
  const publicKey = ed25519.getPublicKey(seed);

  const [signatureCount, signaturesStart] = readShortVec(transaction, 0);
  const messageStart = signaturesStart + signatureCount * SIGNATURE_BYTES;
  if (signatureCount < 1 || messageStart >= transaction.length) throw new SolanaTransactionError();
  const message = transaction.subarray(messageStart);

  // A version prefix (high bit set) means a versioned message; only v0 exists.
  let headerAt = 0;
  if ((message[0]! & 0x80) !== 0) {
    if ((message[0]! & 0x7f) !== 0)
      throw new SolanaTransactionError("That transaction version isn't supported.");
    headerAt = 1;
  }
  const numRequiredSignatures = message[headerAt];
  if (numRequiredSignatures === undefined || numRequiredSignatures !== signatureCount) {
    throw new SolanaTransactionError();
  }
  const [accountCount, accountsStart] = readShortVec(message, headerAt + 3);
  if (
    accountCount < numRequiredSignatures ||
    accountsStart + accountCount * KEY_BYTES > message.length
  ) {
    throw new SolanaTransactionError();
  }

  assertMessageWellFormed(message, accountsStart + accountCount * KEY_BYTES, headerAt === 1);

  let slot = -1;
  for (let i = 0; i < numRequiredSignatures; i += 1) {
    const key = message.subarray(
      accountsStart + i * KEY_BYTES,
      accountsStart + (i + 1) * KEY_BYTES
    );
    if (key.every((byte, j) => byte === publicKey[j])) {
      slot = i;
      break;
    }
  }
  if (slot < 0) throw new SolanaTransactionError("This transaction isn't for this wallet.");

  const signed = transaction.slice();
  signed.set(ed25519.sign(message, seed), signaturesStart + slot * SIGNATURE_BYTES);
  return signed;
}
