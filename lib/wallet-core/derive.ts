import { ed25519 } from "@noble/curves/ed25519";
import { hmac } from "@noble/hashes/hmac";
import { sha512 } from "@noble/hashes/sha2";
import { HDKey } from "@scure/bip32";
import { base58 } from "@scure/base";
import { privateKeyToAddress } from "viem/accounts";
import type { ChainFamily } from "./aad";
import { concatBytes, toBase64Url, utf8, wipeBytes } from "./encoding";

/**
 * Account keys, derived from the phrase's seed by the standard paths, so any
 * other wallet that imports the phrase arrives at the same addresses.
 *
 *   EVM     m/44'/60'/0'/0/0     BIP-32 / BIP-44 (MetaMask's first account)
 *   Solana  m/44'/501'/0'/0'     SLIP-0010 ed25519 (Phantom's first account)
 *
 * One EVM address serves every EVM network. Keys are derived when needed and
 * dropped straight after; only the encrypted phrase is ever stored.
 */

export const DERIVATION_PATHS = {
  evm: "m/44'/60'/0'/0/0",
  solana: "m/44'/501'/0'/0'",
} as const satisfies Record<ChainFamily, string>;

const SOLANA_PATH = [44, 501, 0, 0] as const;
const HARDENED = 0x8000_0000;

export interface EvmMaterial {
  family: "evm";
  privateKey: `0x${string}`;
}
export interface SolanaMaterial {
  family: "solana";
  /** The 32-byte ed25519 seed. */
  seed: Uint8Array;
}
export type KeyMaterial = EvmMaterial | SolanaMaterial;

export interface DerivedAccount {
  family: ChainFamily;
  algorithm: "secp256k1" | "ed25519";
  derivationPath: string;
  /** base64url: compressed secp256k1 or raw ed25519. */
  publicKey: string;
  address: string;
  material: KeyMaterial;
}

const toHex = (bytes: Uint8Array): `0x${string}` =>
  `0x${[...bytes].map((b) => b.toString(16).padStart(2, "0")).join("")}`;

/** SLIP-0010 for ed25519: hardened-only derivation with HMAC-SHA512. */
export function slip10Ed25519(seed: Uint8Array, path: ReadonlyArray<number>): Uint8Array {
  let digest = hmac(sha512, utf8("ed25519 seed"), seed);
  let key = digest.slice(0, 32);
  let chain = digest.slice(32);
  for (const index of path) {
    const child = new Uint8Array(4);
    new DataView(child.buffer).setUint32(0, (index | HARDENED) >>> 0, false);
    digest = hmac(sha512, chain, concatBytes(Uint8Array.of(0), key, child));
    wipeBytes(key, chain);
    key = digest.slice(0, 32);
    chain = digest.slice(32);
  }
  wipeBytes(chain, digest);
  return key;
}

function deriveEvm(seed: Uint8Array): DerivedAccount {
  const node = HDKey.fromMasterSeed(seed).derive(DERIVATION_PATHS.evm);
  if (!node.privateKey || !node.publicKey) throw new Error("Derivation failed");
  const privateKey = toHex(node.privateKey);
  return {
    family: "evm",
    algorithm: "secp256k1",
    derivationPath: DERIVATION_PATHS.evm,
    publicKey: toBase64Url(node.publicKey),
    address: privateKeyToAddress(privateKey),
    material: { family: "evm", privateKey },
  };
}

function deriveSolana(seed: Uint8Array): DerivedAccount {
  const key = slip10Ed25519(seed, SOLANA_PATH);
  const publicKey = ed25519.getPublicKey(key);
  return {
    family: "solana",
    algorithm: "ed25519",
    derivationPath: DERIVATION_PATHS.solana,
    publicKey: toBase64Url(publicKey),
    address: base58.encode(publicKey),
    material: { family: "solana", seed: key },
  };
}

export function deriveAccount(family: ChainFamily, seed: Uint8Array): DerivedAccount {
  return family === "evm" ? deriveEvm(seed) : deriveSolana(seed);
}

/** The address a piece of key material controls, derived from the key itself. */
export function addressOf(material: KeyMaterial): string {
  if (material.family === "evm") return privateKeyToAddress(material.privateKey);
  return base58.encode(ed25519.getPublicKey(material.seed));
}

export const wipeMaterial = (material: KeyMaterial): void => {
  if (material.family === "solana") wipeBytes(material.seed);
};
