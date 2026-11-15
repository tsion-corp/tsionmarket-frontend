import type { Argon2Params } from "./argon2";

/**
 * The associated-data strings that bind a ciphertext to its context.
 *
 * AES-GCM refuses to open a blob whose associated data differs from what it
 * was sealed with, so each string below makes a ciphertext usable in exactly
 * one place: this wallet, this purpose, this item. The Argon2 parameters are
 * part of the passphrase string, so editing the stored parameters (to weaken
 * them) makes the blob fail to open instead of quietly using the weaker ones.
 *
 * Ids are restricted to a delimiter-free alphabet so no id can smuggle a ":"
 * and make two different contexts produce the same string.
 */

export const PACKAGE_FORMAT = "tsion-wallet-package";
// 4: the keys are random and sealed in the package; the recovery secret only opens the
// envelope that holds the key to that seal (it is no longer the root of the keys).
export const PACKAGE_VERSION = 4;
const PREFIX = `tsion:v${PACKAGE_VERSION}`;

const ID = /^[A-Za-z0-9_.-]{1,128}$/;

export function assertId(value: string, what: string): void {
  if (!ID.test(value)) throw new Error(`Invalid ${what}`);
}

export type ChainFamily = "evm" | "solana";

/** Binds the sealed root key (the seed every account key is derived from) to its wallet. */
export function aadRoot(walletId: string): string {
  assertId(walletId, "wallet id");
  return `${PREFIX}:wallet:${walletId}:root`;
}

export function aadPassphrase(walletId: string, envelopeId: string, p: Argon2Params): string {
  assertId(walletId, "wallet id");
  assertId(envelopeId, "envelope id");
  return `${PREFIX}:wallet:${walletId}:envelope:passphrase:${envelopeId}:argon2id:m${p.memoryKiB}:t${p.iterations}:p${p.parallelism}`;
}

export function aadRecovery(walletId: string, envelopeId: string): string {
  assertId(walletId, "wallet id");
  assertId(envelopeId, "envelope id");
  return `${PREFIX}:wallet:${walletId}:envelope:recovery:${envelopeId}`;
}

export function aadDevice(walletId: string, deviceId: string, envelopeId: string): string {
  assertId(walletId, "wallet id");
  assertId(deviceId, "device id");
  assertId(envelopeId, "envelope id");
  return `${PREFIX}:wallet:${walletId}:envelope:device:${deviceId}:${envelopeId}`;
}

export function aadPinDevice(walletId: string, deviceId: string, p: Argon2Params): string {
  assertId(walletId, "wallet id");
  assertId(deviceId, "device id");
  return `${PREFIX}:wallet:${walletId}:pin:${deviceId}:argon2id:m${p.memoryKiB}:t${p.iterations}:p${p.parallelism}`;
}

/** The HKDF `info` for a wrapping key: same shape as the AAD, minus the parameters. */
export const infoPassphrase = (walletId: string, envelopeId: string) => {
  assertId(walletId, "wallet id");
  assertId(envelopeId, "envelope id");
  return `${PREFIX}:wallet:${walletId}:envelope:passphrase:${envelopeId}`;
};
export const infoRecovery = (walletId: string, envelopeId: string) => {
  assertId(walletId, "wallet id");
  assertId(envelopeId, "envelope id");
  return `${PREFIX}:wallet:${walletId}:envelope:recovery:${envelopeId}`;
};
export const infoDevice = (walletId: string, deviceId: string, envelopeId: string) => {
  assertId(walletId, "wallet id");
  assertId(deviceId, "device id");
  assertId(envelopeId, "envelope id");
  return `${PREFIX}:wallet:${walletId}:envelope:device:${deviceId}:${envelopeId}`;
};
export const infoPin = (walletId: string, deviceId: string) => {
  assertId(walletId, "wallet id");
  assertId(deviceId, "device id");
  return `${PREFIX}:wallet:${walletId}:pin:${deviceId}`;
};

/** HKDF salts, one per purpose, so keys from different purposes can never coincide. */
export const SALT_WRAP = "tsion-dek-wrap-v2";
export const SALT_RECOVERY_SIGNING = "tsion-recovery-signing-v1";
export const SALT_PIN = "tsion-pin-wrap-v2";
export const RECOVERY_SIGNING_INFO = "tsion-recovery-ed25519:v1";

/** HKDF label for the signing key a device uses to authorise changes to the package. */
export const SALT_DEVICE_SIGNING = "tsion-device-signing-v1";
export const infoDeviceSigning = (walletId: string, deviceId: string) => {
  assertId(walletId, "wallet id");
  assertId(deviceId, "device id");
  return `${PREFIX}:wallet:${walletId}:device-signing:${deviceId}`;
};

/** Expands the random 32-byte root into the 64-byte seed the account keys are derived from. */
export const SALT_ROOT_SEED = "tsion-root-seed-v1";
export const INFO_ROOT_SEED = "tsion-root-seed:v1";
