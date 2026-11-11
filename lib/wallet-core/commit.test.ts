import { describe, expect, it } from "vitest";
import { randomBytes } from "./encoding";
import { signRecoveryChallenge, verifyRecoverySignature, createRecoveryEnvelope } from "./envelope";
import { generatePhrase } from "./phrase";
import {
  authorizeDeviceMessage,
  canonicalJson,
  commitMessage,
  deviceSigningKey,
  enrollMessage,
  packageDigest,
  revokeDeviceMessage,
  signAsDevice,
  verifyDeviceSignature,
} from "./commit";

const WALLET = "wallet-1";
const NONCE = "nonce-0123456789abcdef";

describe("canonicalJson", () => {
  it("is independent of key order, at every depth", () => {
    const a = { b: 1, a: { d: [1, { y: 2, x: 1 }], c: "x" } };
    const b = { a: { c: "x", d: [1, { x: 1, y: 2 }] }, b: 1 };
    expect(canonicalJson(a)).toBe(canonicalJson(b));
    expect(canonicalJson(a)).toBe('{"a":{"c":"x","d":[1,{"x":1,"y":2}]},"b":1}');
  });

  it("keeps array order and distinguishes values", () => {
    expect(canonicalJson([1, 2])).not.toBe(canonicalJson([2, 1]));
    expect(canonicalJson({ a: "1" })).not.toBe(canonicalJson({ a: 1 }));
    expect(canonicalJson({ a: null })).toBe('{"a":null}');
  });

  it("drops undefined properties and refuses what cannot be represented", () => {
    expect(canonicalJson({ a: 1, b: undefined })).toBe('{"a":1}');
    expect(() => canonicalJson({ a: Number.NaN })).toThrow();
    expect(() => canonicalJson({ a: () => 1 })).toThrow();
  });

  it("escapes strings so two different documents cannot collide", () => {
    expect(canonicalJson({ 'a":1,"b': 2 })).not.toBe(canonicalJson({ a: 1, b: 2 }));
  });
});

describe("packageDigest", () => {
  it("is stable, sensitive to any change, and 43 characters", async () => {
    const pkg = { walletId: WALLET, version: 2, accounts: [{ id: "a" }] };
    const digest = await packageDigest(pkg);
    expect(digest).toHaveLength(43);
    expect(await packageDigest({ accounts: [{ id: "a" }], version: 2, walletId: WALLET })).toBe(
      digest
    );
    expect(await packageDigest({ ...pkg, version: 3 })).not.toBe(digest);
    expect(await packageDigest({ ...pkg, accounts: [{ id: "b" }] })).not.toBe(digest);
  });
});

describe("messages", () => {
  it("name every input, in a fixed order, under a distinct label per operation", async () => {
    const digest = await packageDigest({ x: 1 });
    const { publicKey } = await deviceSigningKey(randomBytes(32), WALLET, "dev-1");
    const messages = [
      commitMessage(WALLET, 3, digest, NONCE),
      enrollMessage(WALLET, "dev-1", publicKey, NONCE),
      authorizeDeviceMessage(WALLET, "dev-1", publicKey, NONCE),
      revokeDeviceMessage(WALLET, "dev-1", NONCE),
    ];
    expect(new Set(messages.map((m) => m.split(":")[0])).size).toBe(4);
    expect(messages[0]).toBe(`tsion-package-commit:v1:${WALLET}:3:${digest}:${NONCE}`);
    expect(messages[3]).toBe(`tsion-device-revoke:v1:${WALLET}:dev-1:${NONCE}`);
  });

  it("reject inputs that could change what the message means", async () => {
    const digest = await packageDigest({ x: 1 });
    expect(() => commitMessage("wallet:1", 1, digest, NONCE)).toThrow();
    expect(() => commitMessage(WALLET, -1, digest, NONCE)).toThrow();
    expect(() => commitMessage(WALLET, 1.5, digest, NONCE)).toThrow();
    expect(() => commitMessage(WALLET, 1, "short", NONCE)).toThrow();
    expect(() => commitMessage(WALLET, 1, digest, "short")).toThrow();
    expect(() => revokeDeviceMessage(WALLET, "a b", NONCE)).toThrow();
    expect(() => enrollMessage(WALLET, "dev-1", "not a key", NONCE)).toThrow();
  });
});

describe("device signing key", () => {
  it("is derived from the device secret, per wallet and per device", async () => {
    const secret = randomBytes(32);
    const a = await deviceSigningKey(secret, WALLET, "dev-1");
    expect((await deviceSigningKey(secret, WALLET, "dev-1")).publicKey).toBe(a.publicKey);
    expect((await deviceSigningKey(secret, WALLET, "dev-2")).publicKey).not.toBe(a.publicKey);
    expect((await deviceSigningKey(secret, "wallet-2", "dev-1")).publicKey).not.toBe(a.publicKey);
    expect((await deviceSigningKey(randomBytes(32), WALLET, "dev-1")).publicKey).not.toBe(
      a.publicKey
    );
    expect(a.publicKey).toHaveLength(43);
  });

  it("refuses a secret of the wrong length", async () => {
    await expect(deviceSigningKey(new Uint8Array(16), WALLET, "dev-1")).rejects.toThrow();
  });
});

describe("device signatures", () => {
  it("verify for the right key and message only", async () => {
    const secret = randomBytes(32);
    const { publicKey } = await deviceSigningKey(secret, WALLET, "dev-1");
    const message = revokeDeviceMessage(WALLET, "dev-9", NONCE);
    const signature = await signAsDevice(secret, WALLET, "dev-1", message);
    expect(verifyDeviceSignature(publicKey, message, signature)).toBe(true);
    expect(
      verifyDeviceSignature(publicKey, revokeDeviceMessage(WALLET, "dev-8", NONCE), signature)
    ).toBe(false);
    const other = await deviceSigningKey(randomBytes(32), WALLET, "dev-1");
    expect(verifyDeviceSignature(other.publicKey, message, signature)).toBe(false);
    expect(verifyDeviceSignature(publicKey, message, "AAAA")).toBe(false);
    expect(verifyDeviceSignature("not a key", message, signature)).toBe(false);
  });

  it("are not interchangeable with recovery signatures", async () => {
    const entropy = generatePhrase().entropy;
    const secret = randomBytes(32);
    const { publicKey: devicePublic } = await deviceSigningKey(secret, WALLET, "dev-1");
    const recovery = await createRecoveryEnvelope({
      walletId: WALLET,
      envelopeId: "rec-1",
      dek: randomBytes(32),
      entropy,
    });
    const message = commitMessage(WALLET, 1, await packageDigest({ x: 1 }), NONCE);

    const deviceSig = await signAsDevice(secret, WALLET, "dev-1", message);
    const recoverySig = await signRecoveryChallenge(entropy, message);
    expect(verifyRecoverySignature(recovery.recoveryPublicKey, message, recoverySig)).toBe(true);
    expect(verifyDeviceSignature(devicePublic, message, deviceSig)).toBe(true);
    // Each is rejected under the other's rules, even over the same message.
    expect(verifyRecoverySignature(recovery.recoveryPublicKey, message, deviceSig)).toBe(false);
    expect(verifyDeviceSignature(devicePublic, message, recoverySig)).toBe(false);
  });

  it("a recovery signature over a commit message verifies under the recovery public key", async () => {
    const entropy = generatePhrase().entropy;
    const recovery = await createRecoveryEnvelope({
      walletId: WALLET,
      envelopeId: "rec-1",
      dek: randomBytes(32),
      entropy,
    });
    const message = commitMessage(WALLET, 4, await packageDigest({ p: 1 }), NONCE);
    const signature = await signRecoveryChallenge(entropy, message);
    expect(verifyRecoverySignature(recovery.recoveryPublicKey, message, signature)).toBe(true);
    expect(
      verifyRecoverySignature(recovery.recoveryPublicKey, message.replace(":4:", ":5:"), signature)
    ).toBe(false);
  });
});
