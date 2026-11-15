import type { DeviceUnlockStore } from "@/lib/wallet-device/store";
import { PACKAGE_FORMAT, SALT_WRAP } from "./aad";
import { OpenError, hkdfSha256, open, seal } from "./crypto";
import {
  FRESH_PIN_GUARD,
  isValidPin,
  pinWait,
  recordPinFailure,
  recordPinSuccess,
  unwrapDeviceSecret,
  wrapDeviceSecret,
} from "./device-pin";
import { randomBytes, wipeBytes } from "./encoding";
import type { Argon2Params } from "./argon2";

/**
 * Unlocking with a PIN on a device the person has already unlocked with their passphrase.
 *
 * The wallet key is sealed under a random device secret, and the device secret is wrapped by
 * the PIN, both kept in this browser only. The server never sees any of it, and a copy of the
 * wallet from the server gives nothing to test a PIN against. Someone who copied THIS device's
 * storage could still try PINs offline, so the PIN is a convenience for the device the person
 * already controls, not a replacement for the passphrase and recovery secret: wrong PINs here
 * are limited (waits that double, and ten wipe it), and the passphrase always still works.
 */

/** The id this local unlock goes by in the key derivation; there is one per account per device. */
const DEK_BYTES = 32;
const LOCAL_DEVICE = "local-pin-unlock";
const sealedAad = (walletId: string) => `${PACKAGE_FORMAT}:wallet:${walletId}:local-device-dek:v1`;
const sealInfo = (walletId: string) => `${PACKAGE_FORMAT}:wallet:${walletId}:local-device-dek`;

export class PinUnlockError extends Error {
  constructor(
    readonly reason: "wrong" | "wait" | "wiped" | "none",
    /** Milliseconds until another try is allowed, for `wait`. */
    readonly waitMs = 0,
    /** Tries left before the PIN is wiped, for `wrong`. */
    readonly triesLeft = 0
  ) {
    super(
      reason === "wait"
        ? "Too many wrong PINs. Wait a moment, or use your passphrase."
        : reason === "wiped"
          ? "That was the last try, so the PIN has been removed from this device. Use your passphrase."
          : reason === "none"
            ? "There is no PIN on this device."
            : "That PIN is wrong."
    );
    this.name = "PinUnlockError";
  }
}

/** Seal the wallet key behind `pin` on this device. The caller has just unlocked, so it has the key. */
export async function enableDeviceUnlock(input: {
  store: DeviceUnlockStore;
  uid: string;
  walletId: string;
  dek: Uint8Array;
  pin: string;
  params?: Argon2Params;
}): Promise<void> {
  if (!isValidPin(input.pin)) throw new Error("A PIN is 6 to 12 digits.");
  if (input.dek.length !== DEK_BYTES) throw new Error("The wallet key is not valid.");
  const deviceSecret = randomBytes(32);
  try {
    const pin = await wrapDeviceSecret({
      pin: input.pin,
      deviceSecret,
      walletId: input.walletId,
      deviceId: LOCAL_DEVICE,
      params: input.params,
    });
    const sealKey = await hkdfSha256(deviceSecret, SALT_WRAP, sealInfo(input.walletId));
    const sealedKey = await seal(sealKey, input.dek, sealedAad(input.walletId));
    wipeBytes(sealKey);
    await input.store.put({
      uid: input.uid,
      walletId: input.walletId,
      pin,
      sealedKey,
      guard: FRESH_PIN_GUARD,
    });
  } finally {
    wipeBytes(deviceSecret);
  }
}

export async function hasDeviceUnlock(
  store: DeviceUnlockStore,
  uid: string,
  walletId: string
): Promise<boolean> {
  const record = await store.get(uid);
  return record !== null && record.walletId === walletId;
}

export async function removeDeviceUnlock(store: DeviceUnlockStore, uid: string): Promise<void> {
  await store.remove(uid);
}

/**
 * The wallet key, if `pin` is right. Wrong tries are counted and persisted before anything else,
 * so closing the tab does not reset them; the tenth wipes the PIN from this device.
 */
export async function unlockWithDevicePin(input: {
  store: DeviceUnlockStore;
  uid: string;
  walletId: string;
  pin: string;
  now?: () => number;
}): Promise<Uint8Array> {
  const now = (input.now ?? Date.now)();
  const record = await input.store.get(input.uid);
  if (!record || record.walletId !== input.walletId) throw new PinUnlockError("none");
  const wait = pinWait(record.guard, now);
  if (wait > 0) throw new PinUnlockError("wait", wait);

  let deviceSecret: Uint8Array;
  try {
    deviceSecret = await unwrapDeviceSecret({
      pin: input.pin,
      stored: record.pin,
      walletId: input.walletId,
      deviceId: LOCAL_DEVICE,
    });
  } catch (error) {
    if (!(error instanceof OpenError)) throw error;
    const failed = recordPinFailure(record.guard, now);
    if (failed.wipe) {
      await input.store.remove(input.uid);
      throw new PinUnlockError("wiped");
    }
    await input.store.put({ ...record, guard: failed.state });
    throw new PinUnlockError("wrong", 0, 10 - failed.state.failures);
  }

  try {
    const sealKey = await hkdfSha256(deviceSecret, SALT_WRAP, sealInfo(input.walletId));
    let dek: Uint8Array;
    try {
      dek = await open(sealKey, record.sealedKey, sealedAad(input.walletId));
    } finally {
      wipeBytes(sealKey);
    }
    if (dek.length !== DEK_BYTES) throw new OpenError();
    await input.store.put({ ...record, guard: recordPinSuccess() });
    return dek;
  } finally {
    wipeBytes(deviceSecret);
  }
}
