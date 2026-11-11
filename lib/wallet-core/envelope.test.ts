import { describe, expect, it } from "vitest";
import { aadPassphrase } from "./aad";
import { Argon2ParamsError, type Argon2Params } from "./argon2";
import { OpenError } from "./crypto";
import { fromBase64Url, randomBytes, toBase64Url } from "./encoding";
import {
  createDeviceEnvelope,
  createPassphraseEnvelope,
  createRecoveryEnvelope,
  openDeviceEnvelope,
  openPassphraseEnvelope,
  openRecoveryEnvelope,
  signRecoveryChallenge,
  verifyRecoverySignature,
} from "./envelope";
import { WeakPassphraseError } from "./passphrase";
import { generatePhrase } from "./phrase";

// The floor: the cheapest parameters the code will accept, so these tests stay fast.
const FAST: Argon2Params = { memoryKiB: 32_768, iterations: 2, parallelism: 1, hashLength: 32 };
const WALLET = "wallet-1";
const OTHER_WALLET = "wallet-2";
const PHRASE = "correct horse battery staple";

const make = (extra: Partial<Parameters<typeof createPassphraseEnvelope>[0]> = {}) => {
  const dek = randomBytes(32);
  return createPassphraseEnvelope({
    walletId: WALLET,
    envelopeId: "env-1",
    dek,
    passphrase: PHRASE,
    params: FAST,
    ...extra,
  }).then((envelope) => ({ envelope, dek }));
};

describe("passphrase envelope", () => {
  it("opens with the right passphrase and returns the same key", async () => {
    const { envelope, dek } = await make();
    expect(
      await openPassphraseEnvelope({ walletId: WALLET, envelope, passphrase: PHRASE })
    ).toEqual(dek);
  });

  it("does not open with a wrong passphrase, and says nothing about why", async () => {
    const { envelope } = await make();
    await expect(
      openPassphraseEnvelope({
        walletId: WALLET,
        envelope,
        passphrase: "wrong horse battery staple",
      })
    ).rejects.toBeInstanceOf(OpenError);
  });

  it("records the parameters it used and uses a fresh salt every time", async () => {
    const a = (await make()).envelope;
    const b = (await make()).envelope;
    expect(a.keyDerivationMetadata).toMatchObject({
      kind: "argon2id",
      version: 19,
      memoryKiB: 32_768,
      iterations: 2,
      parallelism: 1,
      hashLength: 32,
    });
    expect(fromBase64Url(a.keyDerivationMetadata.salt)).toHaveLength(16);
    expect(a.keyDerivationMetadata.salt).not.toBe(b.keyDerivationMetadata.salt);
    expect(a.wrappedDek).not.toBe(b.wrappedDek);
  });

  it("uses the strong defaults when no parameters are given", async () => {
    const dek = randomBytes(32);
    const envelope = await createPassphraseEnvelope({
      walletId: WALLET,
      envelopeId: "e",
      dek,
      passphrase: PHRASE,
    });
    expect(envelope.keyDerivationMetadata).toMatchObject({
      memoryKiB: 65_536,
      iterations: 3,
      parallelism: 1,
    });
    expect(
      await openPassphraseEnvelope({ walletId: WALLET, envelope, passphrase: PHRASE })
    ).toEqual(dek);
  }, 30_000);

  it("refuses a weak passphrase when creating, unless re-wrapping an existing one", async () => {
    await expect(make({ passphrase: "short" })).rejects.toBeInstanceOf(WeakPassphraseError);
    await expect(make({ passphrase: "short", skipPolicy: true })).resolves.toBeDefined();
  });

  it("refuses parameters below the floor when creating", async () => {
    await expect(make({ params: { ...FAST, memoryKiB: 4_096 } })).rejects.toBeInstanceOf(
      Argon2ParamsError
    );
  });

  it("treats visually identical passphrases as the same, across normalisation forms", async () => {
    const composed = "café au lait demain matin";
    const decomposed = "café au lait demain matin";
    const { envelope, dek } = await make({ passphrase: composed });
    expect(
      await openPassphraseEnvelope({ walletId: WALLET, envelope, passphrase: decomposed })
    ).toEqual(dek);
  });

  it("does not trim: a stray space is a different passphrase", async () => {
    const { envelope } = await make();
    await expect(
      openPassphraseEnvelope({ walletId: WALLET, envelope, passphrase: ` ${PHRASE}` })
    ).rejects.toBeInstanceOf(OpenError);
  });
});

describe("tampering with a passphrase envelope", () => {
  it("fails if the stored parameters are weakened, even when the passphrase is right", async () => {
    const { envelope } = await make();
    for (const change of [{ iterations: 3 }, { memoryKiB: 49_152 }, { parallelism: 2 }]) {
      const tampered = {
        ...envelope,
        keyDerivationMetadata: { ...envelope.keyDerivationMetadata, ...change },
      };
      await expect(
        openPassphraseEnvelope({ walletId: WALLET, envelope: tampered, passphrase: PHRASE })
      ).rejects.toBeInstanceOf(OpenError);
    }
  });

  it("refuses parameters outside the allowed range before deriving anything", async () => {
    const { envelope } = await make();
    for (const memoryKiB of [1_024, 4_194_304]) {
      const tampered = {
        ...envelope,
        keyDerivationMetadata: { ...envelope.keyDerivationMetadata, memoryKiB },
      };
      await expect(
        openPassphraseEnvelope({ walletId: WALLET, envelope: tampered, passphrase: PHRASE })
      ).rejects.toBeInstanceOf(Argon2ParamsError);
    }
  });

  it("fails if the salt is changed, truncated or replaced", async () => {
    const { envelope } = await make();
    for (const salt of [toBase64Url(randomBytes(16)), toBase64Url(randomBytes(8))]) {
      const tampered = {
        ...envelope,
        keyDerivationMetadata: { ...envelope.keyDerivationMetadata, salt },
      };
      await expect(
        openPassphraseEnvelope({ walletId: WALLET, envelope: tampered, passphrase: PHRASE })
      ).rejects.toBeInstanceOf(OpenError);
    }
  });

  it("fails if the ciphertext or iv is altered by a single bit", async () => {
    const { envelope } = await make();
    const flip = (text: string) => {
      const bytes = fromBase64Url(text);
      bytes[0]! ^= 1;
      return toBase64Url(bytes);
    };
    await expect(
      openPassphraseEnvelope({
        walletId: WALLET,
        envelope: { ...envelope, wrappedDek: flip(envelope.wrappedDek) },
        passphrase: PHRASE,
      })
    ).rejects.toBeInstanceOf(OpenError);
    await expect(
      openPassphraseEnvelope({
        walletId: WALLET,
        envelope: { ...envelope, iv: flip(envelope.iv) },
        passphrase: PHRASE,
      })
    ).rejects.toBeInstanceOf(OpenError);
  });

  it("only opens for the wallet it was made for", async () => {
    const { envelope } = await make();
    await expect(
      openPassphraseEnvelope({ walletId: OTHER_WALLET, envelope, passphrase: PHRASE })
    ).rejects.toBeInstanceOf(OpenError);
  });

  it("only opens as the envelope it was made as (a copied blob under another id fails)", async () => {
    const { envelope } = await make();
    const renamed = { ...envelope, envelopeId: "env-2", aad: aadPassphrase(WALLET, "env-2", FAST) };
    await expect(
      openPassphraseEnvelope({ walletId: WALLET, envelope: renamed, passphrase: PHRASE })
    ).rejects.toBeInstanceOf(OpenError);
  });

  it("rejects a forged associated-data string", async () => {
    const { envelope } = await make();
    await expect(
      openPassphraseEnvelope({
        walletId: WALLET,
        envelope: { ...envelope, aad: "anything" },
        passphrase: PHRASE,
      })
    ).rejects.toBeInstanceOf(OpenError);
  });
});

describe("recovery envelope", () => {
  const build = async () => {
    const dek = randomBytes(32);
    const entropy = generatePhrase().entropy;
    const envelope = await createRecoveryEnvelope({
      walletId: WALLET,
      envelopeId: "rec-1",
      dek,
      entropy,
    });
    return { dek, entropy, envelope };
  };

  it("opens with the recovery phrase and only with it", async () => {
    const { dek, entropy, envelope } = await build();
    expect(await openRecoveryEnvelope({ walletId: WALLET, envelope, entropy })).toEqual(dek);
    await expect(
      openRecoveryEnvelope({ walletId: WALLET, envelope, entropy: generatePhrase().entropy })
    ).rejects.toBeInstanceOf(OpenError);
    // A valid length of the wrong bytes, and an invalid length altogether.
    await expect(
      openRecoveryEnvelope({ walletId: WALLET, envelope, entropy: new Uint8Array(32) })
    ).rejects.toBeInstanceOf(OpenError);
    await expect(
      openRecoveryEnvelope({ walletId: WALLET, envelope, entropy: new Uint8Array(15) })
    ).rejects.toBeInstanceOf(OpenError);
  });

  it("works for a 12-word phrase brought from another wallet", async () => {
    const dek = randomBytes(32);
    const entropy = generatePhrase(12).entropy;
    const envelope = await createRecoveryEnvelope({
      walletId: WALLET,
      envelopeId: "rec-1",
      dek,
      entropy,
    });
    expect(await openRecoveryEnvelope({ walletId: WALLET, envelope, entropy })).toEqual(dek);
  });

  it("is bound to its wallet and its id", async () => {
    const { entropy, envelope } = await build();
    await expect(
      openRecoveryEnvelope({ walletId: OTHER_WALLET, envelope, entropy })
    ).rejects.toBeInstanceOf(OpenError);
    await expect(
      openRecoveryEnvelope({
        walletId: WALLET,
        envelope: { ...envelope, envelopeId: "rec-2" },
        entropy,
      })
    ).rejects.toBeInstanceOf(OpenError);
  });

  it("rejects an envelope whose recovery public key was swapped", async () => {
    const { entropy, envelope } = await build();
    const other = await createRecoveryEnvelope({
      walletId: WALLET,
      envelopeId: "rec-1",
      dek: randomBytes(32),
      entropy: generatePhrase().entropy,
    });
    await expect(
      openRecoveryEnvelope({
        walletId: WALLET,
        envelope: { ...envelope, recoveryPublicKey: other.recoveryPublicKey },
        entropy,
      })
    ).rejects.toBeInstanceOf(OpenError);
  });

  it("signs the server's challenge without revealing the phrase", async () => {
    const { entropy, envelope } = await build();
    const signature = await signRecoveryChallenge(entropy, "challenge-abc");
    expect(verifyRecoverySignature(envelope.recoveryPublicKey, "challenge-abc", signature)).toBe(
      true
    );
    expect(verifyRecoverySignature(envelope.recoveryPublicKey, "challenge-xyz", signature)).toBe(
      false
    );
    expect(verifyRecoverySignature(envelope.recoveryPublicKey, "challenge-abc", "AAAA")).toBe(
      false
    );
    expect(verifyRecoverySignature("not base64 !", "challenge-abc", signature)).toBe(false);
    expect(signature).not.toContain(toBase64Url(entropy));
    await expect(signRecoveryChallenge(new Uint8Array(15), "c")).rejects.toBeInstanceOf(OpenError);
  });

  it("publishes a fingerprint that identifies the key without being it", async () => {
    const { envelope } = await build();
    expect(fromBase64Url(envelope.verificationFingerprint)).toHaveLength(32);
    expect(envelope.verificationFingerprint).not.toBe(envelope.recoveryPublicKey);
  });

  it("derives different keys for the wrapping and for signing (independent labels)", async () => {
    const { entropy, envelope } = await build();
    // Signing with the phrase must not be possible with only the wrapped blob.
    expect(envelope.recoveryPublicKey).not.toContain(toBase64Url(entropy));
    expect(envelope.wrappedDek).not.toContain(envelope.recoveryPublicKey);
  });
});

describe("device envelope", () => {
  const build = async () => {
    const dek = randomBytes(32);
    const deviceSecret = randomBytes(32);
    const envelope = await createDeviceEnvelope({
      walletId: WALLET,
      deviceId: "dev-1",
      envelopeId: "dev-env-1",
      dek,
      deviceSecret,
    });
    return { dek, deviceSecret, envelope };
  };

  it("opens with the device secret and only with it", async () => {
    const { dek, deviceSecret, envelope } = await build();
    expect(await openDeviceEnvelope({ walletId: WALLET, envelope, deviceSecret })).toEqual(dek);
    await expect(
      openDeviceEnvelope({ walletId: WALLET, envelope, deviceSecret: randomBytes(32) })
    ).rejects.toBeInstanceOf(OpenError);
  });

  it("is bound to its wallet, its device and its id", async () => {
    const { deviceSecret, envelope } = await build();
    await expect(
      openDeviceEnvelope({ walletId: OTHER_WALLET, envelope, deviceSecret })
    ).rejects.toBeInstanceOf(OpenError);
    await expect(
      openDeviceEnvelope({
        walletId: WALLET,
        envelope: { ...envelope, deviceId: "dev-2" },
        deviceSecret,
      })
    ).rejects.toBeInstanceOf(OpenError);
  });
});
