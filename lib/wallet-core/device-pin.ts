import { aadPinDevice, infoPin, SALT_PIN } from "./aad";
import {
  DEFAULT_ARGON2,
  assertSafeArgon2Params,
  deriveArgon2id,
  newSalt,
  type Argon2Params,
} from "./argon2";
import { OpenError, hkdfSha256, open, seal } from "./crypto";
import { fromBase64Url, toBase64Url, wipeBytes } from "./encoding";

/**
 * The device PIN: a convenience that never leaves the device.
 *
 * A short PIN cannot protect anything an attacker can copy and test offline:
 * a million six-digit PINs is only days of work however the PIN is stretched.
 * So the PIN is NOT an envelope in the package the server stores. It protects
 * a random device secret kept in this device's own storage, and that secret is
 * what unlocks this device's envelope. An attacker needs this device's storage
 * AND the PIN; the server's copy gives them nothing to test a PIN against.
 *
 * Wrong attempts are limited, and ten of them destroy the device secret so the
 * person falls back to the passphrase.
 */

export const PIN_PATTERN = /^\d{6,12}$/;
export const MAX_PIN_FAILURES = 10;

export const isValidPin = (pin: string): boolean => PIN_PATTERN.test(pin);

export interface WrappedDeviceSecret {
  salt: string;
  memoryKiB: number;
  iterations: number;
  parallelism: number;
  iv: string;
  wrapped: string;
  aad: string;
}

export async function wrapDeviceSecret(input: {
  pin: string;
  deviceSecret: Uint8Array;
  walletId: string;
  deviceId: string;
  params?: Argon2Params;
}): Promise<WrappedDeviceSecret> {
  if (!isValidPin(input.pin)) throw new Error("A PIN is 6 to 12 digits");
  const params = input.params ?? DEFAULT_ARGON2;
  assertSafeArgon2Params(params);
  const salt = newSalt();
  const stretched = await deriveArgon2id(input.pin, salt, params);
  const wrapKey = await hkdfSha256(stretched, SALT_PIN, infoPin(input.walletId, input.deviceId));
  const aad = aadPinDevice(input.walletId, input.deviceId, params);
  const sealed = await seal(wrapKey, input.deviceSecret, aad);
  wipeBytes(stretched, wrapKey);
  return {
    salt: toBase64Url(salt),
    memoryKiB: params.memoryKiB,
    iterations: params.iterations,
    parallelism: params.parallelism,
    iv: sealed.iv,
    wrapped: sealed.ciphertext,
    aad,
  };
}

export async function unwrapDeviceSecret(input: {
  pin: string;
  stored: WrappedDeviceSecret;
  walletId: string;
  deviceId: string;
}): Promise<Uint8Array> {
  const { stored } = input;
  const params: Argon2Params = {
    memoryKiB: stored.memoryKiB,
    iterations: stored.iterations,
    parallelism: stored.parallelism,
    hashLength: 32,
  };
  assertSafeArgon2Params(params);
  if (stored.aad !== aadPinDevice(input.walletId, input.deviceId, params)) throw new OpenError();
  if (!isValidPin(input.pin)) throw new OpenError();
  const stretched = await deriveArgon2id(input.pin, fromBase64Url(stored.salt), params);
  const wrapKey = await hkdfSha256(stretched, SALT_PIN, infoPin(input.walletId, input.deviceId));
  try {
    return await open(wrapKey, { iv: stored.iv, ciphertext: stored.wrapped }, stored.aad);
  } finally {
    wipeBytes(stretched, wrapKey);
  }
}

// ── attempt limiting ────────────────────────────────────────────────────────

export interface PinGuardState {
  failures: number;
  /** Epoch ms before which no attempt is accepted. */
  lockedUntil: number;
}

export const FRESH_PIN_GUARD: PinGuardState = { failures: 0, lockedUntil: 0 };
const FIRST_LOCK_MS = 30_000;
const FREE_ATTEMPTS = 4;

export function pinWait(state: PinGuardState, now: number): number {
  return Math.max(0, state.lockedUntil - now);
}

/**
 * After a wrong PIN: the next state, and whether the device secret must now be
 * destroyed. The first few misses are free; then waits double (30 s, 60 s, …),
 * and the tenth miss wipes.
 */
export function recordPinFailure(
  state: PinGuardState,
  now: number
): { state: PinGuardState; wipe: boolean } {
  const failures = state.failures + 1;
  if (failures >= MAX_PIN_FAILURES)
    return { state: { failures, lockedUntil: Number.POSITIVE_INFINITY }, wipe: true };
  const lockedUntil =
    failures > FREE_ATTEMPTS ? now + FIRST_LOCK_MS * 2 ** (failures - FREE_ATTEMPTS - 1) : 0;
  return { state: { failures, lockedUntil }, wipe: false };
}

export const recordPinSuccess = (): PinGuardState => FRESH_PIN_GUARD;
