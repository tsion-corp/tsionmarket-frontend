import { ed25519 } from "@noble/curves/ed25519";
import {
  RECOVERY_SIGNING_INFO,
  SALT_RECOVERY_SIGNING,
  SALT_WRAP,
  aadDevice,
  aadPassphrase,
  aadRecovery,
  infoDevice,
  infoPassphrase,
  infoRecovery,
} from "./aad";
import {
  ARGON2_SALT_BYTES,
  ARGON2_VERSION,
  Argon2ParamsError,
  DEFAULT_ARGON2,
  assertSafeArgon2Params,
  deriveArgon2id,
  newSalt,
  type Argon2Params,
} from "./argon2";
import { OpenError, hkdfSha256, open, seal, sha256 } from "./crypto";
import { fromBase64Url, toBase64Url, utf8, wipeBytes } from "./encoding";
import { assertStrongPassphrase, normalizePassphrase } from "./passphrase";
import { isValidEntropyLength } from "./phrase";

/**
 * Envelopes: the ways of unlocking the one wallet key (the DEK).
 *
 * Each envelope is the same 32-byte DEK sealed under a different wrapping key,
 * so any one of them is enough and none reveals another. The server stores
 * them as opaque text and can open none of them.
 *
 *   passphrase  Argon2id(passphrase) → HKDF → AES-GCM       (methodVersion 2)
 *   recovery    HKDF(recovery phrase) → AES-GCM, plus an Ed25519 key that
 *               signs the server's one-time recovery challenge (methodVersion 1)
 *   device      HKDF(device secret) → AES-GCM, for a device that has already
 *               unlocked once (methodVersion 1)
 */

export interface Argon2Meta {
  kind: "argon2id";
  version: typeof ARGON2_VERSION;
  salt: string;
  memoryKiB: number;
  iterations: number;
  parallelism: number;
  hashLength: 32;
}

interface EnvelopeBase {
  envelopeId: string;
  wrappedDek: string;
  iv: string;
  aad: string;
}

export interface PassphraseEnvelope extends EnvelopeBase {
  purpose: "passphrase";
  methodVersion: 2;
  keyDerivationMetadata: Argon2Meta;
}

export interface RecoveryEnvelope extends EnvelopeBase {
  purpose: "recovery";
  methodVersion: 1;
  keyDerivationMetadata: { kind: "hkdf-sha256"; version: 1; source: "recovery-phrase" };
  recoveryPublicKey: string;
  verificationFingerprint: string;
}

export interface DeviceEnvelope extends EnvelopeBase {
  purpose: "device";
  methodVersion: 1;
  deviceId: string;
  keyDerivationMetadata: { kind: "hkdf-sha256"; version: 1; source: "device-secret" };
}

export type Envelope = PassphraseEnvelope | RecoveryEnvelope | DeviceEnvelope;

const DEK_BYTES = 32;

function checkDek(dek: Uint8Array): void {
  if (dek.length !== DEK_BYTES) throw new Error("The wallet key must be 32 bytes");
}

// ── passphrase ──────────────────────────────────────────────────────────────

export async function createPassphraseEnvelope(input: {
  walletId: string;
  envelopeId: string;
  dek: Uint8Array;
  passphrase: string;
  params?: Argon2Params;
  /**
   * Skip the strength policy. ONLY for re-wrapping an existing passphrase with
   * stronger parameters, where the person is not choosing a new one.
   */
  skipPolicy?: boolean;
}): Promise<PassphraseEnvelope> {
  checkDek(input.dek);
  if (!input.skipPolicy) assertStrongPassphrase(input.passphrase);
  const params = input.params ?? DEFAULT_ARGON2;
  assertSafeArgon2Params(params);

  const salt = newSalt();
  const stretched = await deriveArgon2id(normalizePassphrase(input.passphrase), salt, params);
  const wrapKey = await hkdfSha256(
    stretched,
    SALT_WRAP,
    infoPassphrase(input.walletId, input.envelopeId)
  );
  const aad = aadPassphrase(input.walletId, input.envelopeId, params);
  const sealed = await seal(wrapKey, input.dek, aad);
  wipeBytes(stretched, wrapKey);

  return {
    envelopeId: input.envelopeId,
    purpose: "passphrase",
    methodVersion: 2,
    wrappedDek: sealed.ciphertext,
    iv: sealed.iv,
    aad,
    keyDerivationMetadata: {
      kind: "argon2id",
      version: ARGON2_VERSION,
      salt: toBase64Url(salt),
      memoryKiB: params.memoryKiB,
      iterations: params.iterations,
      parallelism: params.parallelism,
      hashLength: 32,
    },
  };
}

/** The parameters a stored passphrase envelope claims, range-checked. */
export function passphraseParams(envelope: PassphraseEnvelope): Argon2Params {
  const meta = envelope.keyDerivationMetadata as Partial<Argon2Meta> | undefined;
  if (!meta || meta.kind !== "argon2id" || meta.version !== ARGON2_VERSION) {
    throw new Argon2ParamsError("Unrecognised key stretching");
  }
  const params = {
    memoryKiB: meta.memoryKiB,
    iterations: meta.iterations,
    parallelism: meta.parallelism,
    hashLength: meta.hashLength,
  };
  assertSafeArgon2Params(params);
  return params;
}

export async function openPassphraseEnvelope(input: {
  walletId: string;
  envelope: PassphraseEnvelope;
  passphrase: string;
}): Promise<Uint8Array> {
  const { envelope } = input;
  if (envelope.purpose !== "passphrase" || envelope.methodVersion !== 2) throw new OpenError();
  // Checked BEFORE any work: a package cannot make this device do something
  // absurd, or fall back to something weak.
  const params = passphraseParams(envelope);
  const salt = fromBase64Url(envelope.keyDerivationMetadata.salt);
  if (salt.length < ARGON2_SALT_BYTES) throw new OpenError();
  // The stored associated data must be exactly what these facts produce.
  if (envelope.aad !== aadPassphrase(input.walletId, envelope.envelopeId, params))
    throw new OpenError();

  const stretched = await deriveArgon2id(normalizePassphrase(input.passphrase), salt, params);
  const wrapKey = await hkdfSha256(
    stretched,
    SALT_WRAP,
    infoPassphrase(input.walletId, envelope.envelopeId)
  );
  try {
    const dek = await open(
      wrapKey,
      { iv: envelope.iv, ciphertext: envelope.wrappedDek },
      envelope.aad
    );
    if (dek.length !== DEK_BYTES) throw new OpenError();
    return dek;
  } finally {
    wipeBytes(stretched, wrapKey);
  }
}

// ── recovery ────────────────────────────────────────────────────────────────

/**
 * The recovery envelope is opened by the recovery PHRASE (its raw bytes). The
 * phrase is already the master secret of the wallet's keys, so deriving the
 * unlock key from it adds no new exposure: whoever holds the phrase owns the
 * funds anyway. It is high entropy, so HKDF is the right tool, not Argon2.
 *
 * Two independent keys come out of it, by separate HKDF labels: one wraps the
 * wallet key, the other is an Ed25519 key that signs the server's one-time
 * recovery challenge, so the phrase itself never leaves the device.
 */

function assertEntropy(entropy: Uint8Array): void {
  if (!isValidEntropyLength(entropy.length)) throw new OpenError();
}

async function recoveryKeys(entropy: Uint8Array, walletId: string, envelopeId: string) {
  assertEntropy(entropy);
  const wrapKey = await hkdfSha256(entropy, SALT_WRAP, infoRecovery(walletId, envelopeId));
  const signingSeed = await hkdfSha256(entropy, SALT_RECOVERY_SIGNING, RECOVERY_SIGNING_INFO);
  return { wrapKey, signingSeed, publicKey: ed25519.getPublicKey(signingSeed) };
}

export async function createRecoveryEnvelope(input: {
  walletId: string;
  envelopeId: string;
  dek: Uint8Array;
  /** The recovery phrase's raw bytes. */
  entropy: Uint8Array;
}): Promise<RecoveryEnvelope> {
  checkDek(input.dek);
  const { wrapKey, signingSeed, publicKey } = await recoveryKeys(
    input.entropy,
    input.walletId,
    input.envelopeId
  );
  const aad = aadRecovery(input.walletId, input.envelopeId);
  const sealed = await seal(wrapKey, input.dek, aad);
  const fingerprint = await sha256(publicKey);
  wipeBytes(wrapKey, signingSeed);
  return {
    envelopeId: input.envelopeId,
    purpose: "recovery",
    methodVersion: 1,
    wrappedDek: sealed.ciphertext,
    iv: sealed.iv,
    aad,
    keyDerivationMetadata: { kind: "hkdf-sha256", version: 1, source: "recovery-phrase" },
    recoveryPublicKey: toBase64Url(publicKey),
    verificationFingerprint: toBase64Url(fingerprint),
  };
}

export async function openRecoveryEnvelope(input: {
  walletId: string;
  envelope: RecoveryEnvelope;
  entropy: Uint8Array;
}): Promise<Uint8Array> {
  const { envelope } = input;
  if (envelope.purpose !== "recovery" || envelope.methodVersion !== 1) throw new OpenError();
  if (envelope.aad !== aadRecovery(input.walletId, envelope.envelopeId)) throw new OpenError();
  const { wrapKey, signingSeed, publicKey } = await recoveryKeys(
    input.entropy,
    input.walletId,
    envelope.envelopeId
  );
  try {
    // A phrase that derives a different recovery key is not this wallet's.
    if (toBase64Url(publicKey) !== envelope.recoveryPublicKey) throw new OpenError();
    const dek = await open(
      wrapKey,
      { iv: envelope.iv, ciphertext: envelope.wrappedDek },
      envelope.aad
    );
    if (dek.length !== DEK_BYTES) throw new OpenError();
    return dek;
  } finally {
    wipeBytes(wrapKey, signingSeed);
  }
}

const RECOVERY_CHALLENGE_PREFIX = "tsion-recovery-challenge:v1:";

/** Prove possession of the recovery phrase to the server without sending it. */
export async function signRecoveryChallenge(
  entropy: Uint8Array,
  challenge: string
): Promise<string> {
  assertEntropy(entropy);
  const signingSeed = await hkdfSha256(entropy, SALT_RECOVERY_SIGNING, RECOVERY_SIGNING_INFO);
  const signature = ed25519.sign(utf8(RECOVERY_CHALLENGE_PREFIX + challenge), signingSeed);
  wipeBytes(signingSeed);
  return toBase64Url(signature);
}

export function verifyRecoverySignature(
  recoveryPublicKey: string,
  challenge: string,
  signature: string
): boolean {
  try {
    return ed25519.verify(
      fromBase64Url(signature),
      utf8(RECOVERY_CHALLENGE_PREFIX + challenge),
      fromBase64Url(recoveryPublicKey)
    );
  } catch {
    return false;
  }
}

// ── device ──────────────────────────────────────────────────────────────────

export const DEVICE_SECRET_BYTES = 32;

export async function createDeviceEnvelope(input: {
  walletId: string;
  deviceId: string;
  envelopeId: string;
  dek: Uint8Array;
  deviceSecret: Uint8Array;
}): Promise<DeviceEnvelope> {
  checkDek(input.dek);
  if (input.deviceSecret.length !== DEVICE_SECRET_BYTES)
    throw new Error("Device secret must be 32 bytes");
  const wrapKey = await hkdfSha256(
    input.deviceSecret,
    SALT_WRAP,
    infoDevice(input.walletId, input.deviceId, input.envelopeId)
  );
  const aad = aadDevice(input.walletId, input.deviceId, input.envelopeId);
  const sealed = await seal(wrapKey, input.dek, aad);
  wipeBytes(wrapKey);
  return {
    envelopeId: input.envelopeId,
    purpose: "device",
    methodVersion: 1,
    deviceId: input.deviceId,
    wrappedDek: sealed.ciphertext,
    iv: sealed.iv,
    aad,
    keyDerivationMetadata: { kind: "hkdf-sha256", version: 1, source: "device-secret" },
  };
}

export async function openDeviceEnvelope(input: {
  walletId: string;
  envelope: DeviceEnvelope;
  deviceSecret: Uint8Array;
}): Promise<Uint8Array> {
  const { envelope } = input;
  if (envelope.purpose !== "device" || envelope.methodVersion !== 1) throw new OpenError();
  if (envelope.aad !== aadDevice(input.walletId, envelope.deviceId, envelope.envelopeId))
    throw new OpenError();
  if (input.deviceSecret.length !== DEVICE_SECRET_BYTES) throw new OpenError();
  const wrapKey = await hkdfSha256(
    input.deviceSecret,
    SALT_WRAP,
    infoDevice(input.walletId, envelope.deviceId, envelope.envelopeId)
  );
  try {
    const dek = await open(
      wrapKey,
      { iv: envelope.iv, ciphertext: envelope.wrappedDek },
      envelope.aad
    );
    if (dek.length !== DEK_BYTES) throw new OpenError();
    return dek;
  } finally {
    wipeBytes(wrapKey);
  }
}
