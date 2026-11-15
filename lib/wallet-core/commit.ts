import { ed25519 } from "@noble/curves/ed25519";
import { SALT_DEVICE_SIGNING, assertId, infoDeviceSigning } from "./aad";
import { hkdfSha256, sha256 } from "./crypto";
import { fromBase64Url, toBase64Url, utf8, wipeBytes } from "./encoding";

/**
 * Authorising changes to a stored package.
 *
 * Once a wallet's first package is stored, the server must not accept a new one
 * just because a Clerk session asked: a stolen session could overwrite the
 * package with the thief's own. Every later change is therefore signed, over a
 * message that names the wallet, the version it builds on, a digest of the new
 * package and a one-time server nonce, by one of:
 *
 *   - an enrolled DEVICE key (derived from that device's own secret), or
 *   - the RECOVERY key (derived from the recovery secret).
 *
 * The signed message is also domain-separated per operation, so a signature
 * made for one thing cannot be replayed as another.
 */

const DEVICE_SIGNATURE_PREFIX = "tsion-device-signature:v1:";

/** JSON with sorted keys and no whitespace, so the same package always digests the same. */
export function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  switch (typeof value) {
    case "string":
      return JSON.stringify(value);
    case "boolean":
      return value ? "true" : "false";
    case "number":
      if (!Number.isFinite(value)) throw new Error("Cannot canonicalise a non-finite number");
      return JSON.stringify(value);
    case "object": {
      if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
      const entries = Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`);
      return `{${entries.join(",")}}`;
    }
    default:
      throw new Error("Cannot canonicalise this value");
  }
}

export async function packageDigest(pkg: unknown): Promise<string> {
  return toBase64Url(await sha256(utf8(canonicalJson(pkg))));
}

const NONCE = /^[A-Za-z0-9_-]{16,128}$/;
const KEY = /^[A-Za-z0-9_-]{43}$/;
const DIGEST = /^[A-Za-z0-9_-]{43}$/;

function checkNonce(nonce: string): void {
  if (!NONCE.test(nonce)) throw new Error("Invalid nonce");
}

export function commitMessage(
  walletId: string,
  baseVersion: number,
  digest: string,
  nonce: string
): string {
  assertId(walletId, "wallet id");
  if (!Number.isInteger(baseVersion) || baseVersion < 0) throw new Error("Invalid version");
  if (!DIGEST.test(digest)) throw new Error("Invalid digest");
  checkNonce(nonce);
  return `tsion-package-commit:v1:${walletId}:${baseVersion}:${digest}:${nonce}`;
}

/** Signed by the NEW device's own key: proves it holds the key being registered. */
export function enrollMessage(
  walletId: string,
  deviceId: string,
  publicKey: string,
  nonce: string
): string {
  assertId(walletId, "wallet id");
  assertId(deviceId, "device id");
  if (!KEY.test(publicKey)) throw new Error("Invalid public key");
  checkNonce(nonce);
  return `tsion-device-enroll:v1:${walletId}:${deviceId}:${publicKey}:${nonce}`;
}

/** Signed by an enrolled device or the recovery key: authorises adding that device. */
export function authorizeDeviceMessage(
  walletId: string,
  deviceId: string,
  publicKey: string,
  nonce: string
): string {
  assertId(walletId, "wallet id");
  assertId(deviceId, "device id");
  if (!KEY.test(publicKey)) throw new Error("Invalid public key");
  checkNonce(nonce);
  return `tsion-device-authorize:v1:${walletId}:${deviceId}:${publicKey}:${nonce}`;
}

/** Signed by another enrolled device or the recovery key: authorises removing a device. */
export function revokeDeviceMessage(walletId: string, deviceId: string, nonce: string): string {
  assertId(walletId, "wallet id");
  assertId(deviceId, "device id");
  checkNonce(nonce);
  return `tsion-device-revoke:v1:${walletId}:${deviceId}:${nonce}`;
}

/** The signing key a device derives from its own secret. The seed is a secret: wipe it. */
export async function deviceSigningKey(
  deviceSecret: Uint8Array,
  walletId: string,
  deviceId: string
): Promise<{ seed: Uint8Array; publicKey: string }> {
  if (deviceSecret.length !== 32) throw new Error("Device secret must be 32 bytes");
  const seed = await hkdfSha256(
    deviceSecret,
    SALT_DEVICE_SIGNING,
    infoDeviceSigning(walletId, deviceId)
  );
  return { seed, publicKey: toBase64Url(ed25519.getPublicKey(seed)) };
}

export async function signAsDevice(
  deviceSecret: Uint8Array,
  walletId: string,
  deviceId: string,
  message: string
): Promise<string> {
  const { seed } = await deviceSigningKey(deviceSecret, walletId, deviceId);
  const signature = ed25519.sign(utf8(DEVICE_SIGNATURE_PREFIX + message), seed);
  wipeBytes(seed);
  return toBase64Url(signature);
}

export function verifyDeviceSignature(
  publicKey: string,
  message: string,
  signature: string
): boolean {
  try {
    return ed25519.verify(
      fromBase64Url(signature),
      utf8(DEVICE_SIGNATURE_PREFIX + message),
      fromBase64Url(publicKey)
    );
  } catch {
    return false;
  }
}
