import { fromBase64Url, plain, toBase64Url, utf8 } from "./encoding";

/**
 * The two primitives everything else is built from, over WebCrypto.
 *
 *  - HKDF-SHA-256 turns a high-entropy secret into a purpose-specific key.
 *  - AES-256-GCM seals data. Every call uses a fresh random 12-byte IV, a
 *    128-bit tag (appended to the ciphertext) and caller-supplied associated
 *    data, so a ciphertext only opens in the context it was made for.
 *
 * No key here is ever extractable.
 */

export const IV_BYTES = 12;

export async function hkdfSha256(
  ikm: Uint8Array,
  salt: string,
  info: string,
  length = 32
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", plain(ikm), "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: utf8(salt), info: utf8(info) },
    key,
    length * 8
  );
  return new Uint8Array(bits);
}

async function aesKey(raw: Uint8Array, usage: "encrypt" | "decrypt"): Promise<CryptoKey> {
  if (raw.length !== 32) throw new Error("AES key must be 32 bytes");
  return crypto.subtle.importKey("raw", plain(raw), { name: "AES-GCM" }, false, [usage]);
}

export interface Sealed {
  iv: string;
  ciphertext: string;
}

export async function seal(key: Uint8Array, plaintext: Uint8Array, aad: string): Promise<Sealed> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: utf8(aad), tagLength: 128 },
    await aesKey(key, "encrypt"),
    plain(plaintext)
  );
  return { iv: toBase64Url(iv), ciphertext: toBase64Url(new Uint8Array(ciphertext)) };
}

/** Throws `OpenError` for ANY failure, so a wrong key and a tampered blob look the same. */
export async function open(key: Uint8Array, sealed: Sealed, aad: string): Promise<Uint8Array> {
  try {
    const iv = fromBase64Url(sealed.iv);
    if (iv.length !== IV_BYTES) throw new Error("bad iv");
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv, additionalData: utf8(aad), tagLength: 128 },
      await aesKey(key, "decrypt"),
      plain(fromBase64Url(sealed.ciphertext))
    );
    return new Uint8Array(plaintext);
  } catch {
    throw new OpenError();
  }
}

export class OpenError extends Error {
  constructor() {
    super("Could not unlock. The secret is wrong or the data has been changed.");
    this.name = "OpenError";
  }
}

export async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", plain(bytes)));
}
