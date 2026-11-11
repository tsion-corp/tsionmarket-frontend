import { aadRoot } from "./aad";
import { OpenError, open, seal } from "./crypto";
import { fromBase64Url, toBase64Url, utf8, wipeBytes } from "./encoding";
import { isValidEntropyLength } from "./phrase";

/**
 * The encrypted phrase: the only secret the package stores, sealed under the
 * wallet key. Everything else (every account key) is derived from it on use.
 *
 * The plaintext is a small strict JSON document so a blob that opens to
 * something unexpected is rejected rather than used.
 */

export interface SealedRoot {
  ciphertext: string;
  iv: string;
  aad: string;
  dekVersion: 1;
  encoding: "base64url";
}

export class RootError extends Error {
  constructor() {
    super("The stored recovery phrase is not in a recognised format.");
    this.name = "RootError";
  }
}

export async function sealRoot(
  dek: Uint8Array,
  walletId: string,
  entropy: Uint8Array
): Promise<SealedRoot> {
  if (!isValidEntropyLength(entropy.length)) throw new RootError();
  const aad = aadRoot(walletId);
  const plaintext = utf8(
    JSON.stringify({ v: 1, kind: "bip39", language: "english", entropy: toBase64Url(entropy) })
  );
  const sealed = await seal(dek, plaintext, aad);
  wipeBytes(plaintext);
  return {
    ciphertext: sealed.ciphertext,
    iv: sealed.iv,
    aad,
    dekVersion: 1,
    encoding: "base64url",
  };
}

/** The phrase as raw bytes. A secret: the caller wipes it. */
export async function openRoot(
  dek: Uint8Array,
  walletId: string,
  sealed: SealedRoot
): Promise<Uint8Array> {
  if (sealed.aad !== aadRoot(walletId)) throw new OpenError();
  const plaintext = await open(dek, { iv: sealed.iv, ciphertext: sealed.ciphertext }, sealed.aad);
  try {
    const value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(plaintext)) as Record<
      string,
      unknown
    >;
    if (
      typeof value !== "object" ||
      value === null ||
      Object.keys(value).sort().join(",") !== "entropy,kind,language,v" ||
      value.v !== 1 ||
      value.kind !== "bip39" ||
      value.language !== "english" ||
      typeof value.entropy !== "string"
    ) {
      throw new RootError();
    }
    const entropy = fromBase64Url(value.entropy);
    if (!isValidEntropyLength(entropy.length)) throw new RootError();
    return entropy;
  } catch (error) {
    if (error instanceof RootError) throw error;
    throw new RootError();
  } finally {
    wipeBytes(plaintext);
  }
}
