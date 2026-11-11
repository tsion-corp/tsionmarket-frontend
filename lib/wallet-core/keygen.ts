import { ed25519 } from "@noble/curves/ed25519";
import { secp256k1 } from "@noble/curves/secp256k1";
import { base58 } from "@scure/base";
import { privateKeyToAddress } from "viem/accounts";
import { concatBytes, fromBase64Url, toBase64Url, utf8, wipeBytes } from "./encoding";
import type { ChainFamily } from "./aad";

/**
 * Per-chain account keys, generated on the device and never anywhere else.
 *
 * The plaintext that gets encrypted is a small JSON document (UTF-8), one shape
 * per chain family, parsed strictly so a ciphertext that opens to something
 * unexpected is rejected instead of used.
 */

export interface EvmMaterial {
  v: 1;
  family: "evm";
  algorithm: "secp256k1";
  privateKey: `0x${string}`;
}
export interface SolanaMaterial {
  v: 1;
  family: "solana";
  algorithm: "ed25519";
  /** base64url of the 64-byte secret key (32-byte seed then 32-byte public key). */
  secretKey: string;
}
export type KeyMaterial = EvmMaterial | SolanaMaterial;

export interface GeneratedAccount {
  family: ChainFamily;
  algorithm: KeyMaterial["algorithm"];
  /** Hex (EVM, uncompressed-free 33-byte compressed) or base64url (Solana) public key. */
  publicKey: string;
  address: string;
  /** The UTF-8 JSON to encrypt. The caller must wipe it after sealing. */
  plaintext: Uint8Array;
}

const hex = (bytes: Uint8Array) =>
  `0x${[...bytes].map((b) => b.toString(16).padStart(2, "0")).join("")}` as const;
const unhex = (text: string): Uint8Array => {
  const body = text.slice(2);
  const out = new Uint8Array(body.length / 2);
  for (let i = 0; i < out.length; i += 1) out[i] = parseInt(body.slice(i * 2, i * 2 + 2), 16);
  return out;
};

export function generateAccount(family: ChainFamily): GeneratedAccount {
  if (family === "evm") {
    const seed = secp256k1.utils.randomPrivateKey();
    const privateKey = hex(seed);
    const material: EvmMaterial = { v: 1, family: "evm", algorithm: "secp256k1", privateKey };
    const account: GeneratedAccount = {
      family,
      algorithm: "secp256k1",
      publicKey: toBase64Url(secp256k1.getPublicKey(seed, true)),
      address: privateKeyToAddress(privateKey),
      plaintext: utf8(JSON.stringify(material)),
    };
    wipeBytes(seed);
    return account;
  }
  const seed = ed25519.utils.randomPrivateKey();
  const publicKey = ed25519.getPublicKey(seed);
  const secretKey = concatBytes(seed, publicKey);
  const material: SolanaMaterial = {
    v: 1,
    family: "solana",
    algorithm: "ed25519",
    secretKey: toBase64Url(secretKey),
  };
  const account: GeneratedAccount = {
    family,
    algorithm: "ed25519",
    publicKey: toBase64Url(publicKey),
    address: base58.encode(publicKey),
    plaintext: utf8(JSON.stringify(material)),
  };
  wipeBytes(seed, secretKey);
  return account;
}

export class KeyMaterialError extends Error {
  constructor() {
    super("Stored key material is not in a recognised format.");
    this.name = "KeyMaterialError";
  }
}

/** Parse decrypted key material, rejecting anything that is not exactly the expected shape. */
export function parseKeyMaterial(plaintext: Uint8Array): KeyMaterial {
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(plaintext));
  } catch {
    throw new KeyMaterialError();
  }
  if (typeof value !== "object" || value === null) throw new KeyMaterialError();
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort().join(",");
  if (record.v !== 1) throw new KeyMaterialError();
  if (
    record.family === "evm" &&
    record.algorithm === "secp256k1" &&
    keys === "algorithm,family,privateKey,v" &&
    typeof record.privateKey === "string" &&
    /^0x[0-9a-f]{64}$/.test(record.privateKey)
  ) {
    return record as unknown as EvmMaterial;
  }
  if (
    record.family === "solana" &&
    record.algorithm === "ed25519" &&
    keys === "algorithm,family,secretKey,v" &&
    typeof record.secretKey === "string"
  ) {
    try {
      if (fromBase64Url(record.secretKey).length !== 64) throw new Error();
    } catch {
      throw new KeyMaterialError();
    }
    return record as unknown as SolanaMaterial;
  }
  throw new KeyMaterialError();
}

/** The address a piece of key material controls, derived from the key itself. */
export function addressOf(material: KeyMaterial): string {
  if (material.family === "evm") return privateKeyToAddress(material.privateKey);
  const secretKey = fromBase64Url(material.secretKey);
  // The public half is derived from the seed, not trusted from the blob.
  const publicKey = ed25519.getPublicKey(secretKey.slice(0, 32));
  wipeBytes(secretKey);
  return base58.encode(publicKey);
}

export const evmSecret = (material: EvmMaterial): Uint8Array => unhex(material.privateKey);
export const solanaSeed = (material: SolanaMaterial): Uint8Array =>
  fromBase64Url(material.secretKey).slice(0, 32);
