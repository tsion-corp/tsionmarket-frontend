import { SALT_ROOT_SEED, INFO_ROOT_SEED, aadRoot } from "./aad";
import { OpenError, hkdfSha256, open, seal } from "./crypto";
import { fromBase64Url, toBase64Url, utf8, wipeBytes } from "./encoding";

/**
 * The sealed root: the one random seed every account key is derived from, kept in
 * the package encrypted under the wallet key. Account keys are derived from it on
 * use and dropped straight after, so the package holds exactly one key secret.
 *
 * The plaintext is a small strict JSON document so a blob that opens to
 * something unexpected is rejected rather than used.
 */

export const ROOT_BYTES = 32;

export interface SealedRoot {
  ciphertext: string;
  iv: string;
  aad: string;
  dekVersion: 1;
  encoding: "base64url";
}

export class RootError extends Error {
  constructor() {
    super("The stored wallet key is not in a recognised format.");
    this.name = "RootError";
  }
}

export async function sealRoot(
  dek: Uint8Array,
  walletId: string,
  root: Uint8Array
): Promise<SealedRoot> {
  if (root.length !== ROOT_BYTES) throw new RootError();
  const aad = aadRoot(walletId);
  const plaintext = utf8(JSON.stringify({ v: 1, kind: "root-seed", seed: toBase64Url(root) }));
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

/** The root as raw bytes. A secret: the caller wipes it. */
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
      Object.keys(value).sort().join(",") !== "kind,seed,v" ||
      value.v !== 1 ||
      value.kind !== "root-seed" ||
      typeof value.seed !== "string"
    ) {
      throw new RootError();
    }
    const root = fromBase64Url(value.seed);
    if (root.length !== ROOT_BYTES) throw new RootError();
    return root;
  } catch (error) {
    if (error instanceof RootError) throw error;
    throw new RootError();
  } finally {
    wipeBytes(plaintext);
  }
}

/** The 64-byte seed the account keys are derived from. A secret: the caller wipes it. */
export function seedFromRoot(root: Uint8Array): Promise<Uint8Array> {
  if (root.length !== ROOT_BYTES) throw new RootError();
  return hkdfSha256(root, SALT_ROOT_SEED, INFO_ROOT_SEED, 64);
}
