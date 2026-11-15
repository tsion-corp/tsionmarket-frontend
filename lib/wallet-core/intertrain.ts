import { ed25519 } from "@noble/curves/ed25519";
import { sha256 } from "@noble/hashes/sha2";
import { bech32m } from "@scure/base";
import { slip10Ed25519 } from "./derive";
import { concatBytes, utf8, wipeBytes } from "./encoding";
import type { WalletPackage } from "./package";
import { openRoot, seedFromRoot } from "./root";

/**
 * The Intertrain account, derived from the same seed as the EVM and Solana accounts.
 *
 * It matches Intertrain's own wallet: SLIP-0010 ed25519 at m/44'/9999'/0'/0'/<index>', and an
 * address that is the first 20 bytes of sha256("MNA/address/v1" || publicKey) behind a version
 * byte of 1. The node reports these under the `wsk` prefix and accepts both; the bytes are the
 * same, so a `wsk1…` and an `mna1…` address are one account. We show and hand out `wsk1…`.
 *
 * Unlike the EVM and Solana accounts it is not registered with the wallet service: it needs no
 * ownership proof there, and the package's accounts are fixed once made. It is derived on
 * unlock, and only its address (public) is remembered.
 */

const PATH = [44, 9999, 0, 0] as const;
const ADDRESS_DOMAIN = utf8("MNA/address/v1");

export const INTERTRAIN_PREFIX = "wsk";
const LEGACY_PREFIX = "mna";

function addressBytes(publicKey: Uint8Array): Uint8Array {
  if (publicKey.length !== 32) throw new Error("Intertrain public keys must be 32 bytes.");
  const digest = sha256(concatBytes(ADDRESS_DOMAIN, publicKey));
  const payload = new Uint8Array(21);
  payload[0] = 1;
  payload.set(digest.subarray(0, 20), 1);
  return payload;
}

export function intertrainAddressFromPublicKey(
  publicKey: Uint8Array,
  prefix: string = INTERTRAIN_PREFIX
): string {
  return bech32m.encodeFromBytes(prefix, addressBytes(publicKey));
}

export interface IntertrainKey {
  /** The `wsk1…` address. */
  address: string;
  publicKey: Uint8Array;
  /** The 32-byte ed25519 seed. A secret: the caller wipes it. */
  seed: Uint8Array;
}

/** The account at `index` from a 64-byte wallet seed. */
export function deriveIntertrainKey(walletSeed: Uint8Array, index = 0): IntertrainKey {
  if (walletSeed.length !== 64) throw new Error("The wallet seed must be 64 bytes.");
  if (!Number.isSafeInteger(index) || index < 0 || index >= 0x8000_0000) {
    throw new Error("Intertrain account index is invalid.");
  }
  const seed = slip10Ed25519(walletSeed, [...PATH, index]);
  const publicKey = ed25519.getPublicKey(seed);
  return { address: intertrainAddressFromPublicKey(publicKey), publicKey, seed };
}

/** Only the address, with the secret dropped at once. */
export function intertrainAddressFromSeed(walletSeed: Uint8Array, index = 0): string {
  const key = deriveIntertrainKey(walletSeed, index);
  wipeBytes(key.seed);
  return key.address;
}

/**
 * A valid Intertrain address in the `wsk1…` form, from either spelling. Anything that is not a
 * 21-byte version-1 bech32m address is refused: a deposit to it could not be credited.
 */
export function normalizeIntertrainAddress(input: string): string {
  try {
    const { prefix, bytes } = bech32m.decodeToBytes(input.trim().toLowerCase());
    if (
      (prefix !== INTERTRAIN_PREFIX && prefix !== LEGACY_PREFIX) ||
      bytes.length !== 21 ||
      bytes[0] !== 1
    ) {
      throw new Error("shape");
    }
    return bech32m.encodeFromBytes(INTERTRAIN_PREFIX, bytes);
  } catch {
    throw new Error("That is not a valid Intertrain address.");
  }
}

/** Opens the wallet's root, derives the Intertrain account for `run`, and wipes everything after. */
export async function withIntertrainKey<T>(
  pkg: Pick<WalletPackage, "walletId" | "encryptedRoot">,
  dek: Uint8Array,
  run: (key: IntertrainKey) => Promise<T> | T,
  index = 0
): Promise<T> {
  const root = await openRoot(dek, pkg.walletId, pkg.encryptedRoot);
  const seed = await seedFromRoot(root);
  const key = deriveIntertrainKey(seed, index);
  try {
    return await run(key);
  } finally {
    wipeBytes(key.seed, root, seed);
  }
}
