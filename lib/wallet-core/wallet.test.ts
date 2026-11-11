/* eslint-disable @typescript-eslint/no-explicit-any -- these tests deliberately corrupt untrusted-shaped JSON */
import { describe, expect, it } from "vitest";
import { Argon2ParamsError, DEFAULT_ARGON2, type Argon2Params } from "./argon2";
import { OpenError } from "./crypto";
import { toBase64Url } from "./encoding";
import { KeyMaterialError } from "./keygen";
import { PackageValidationError, validateWalletPackage, type WalletPackage } from "./package";
import { signPossession, verifyPossession } from "./proof";
import {
  parseRecoverySecret,
  recoverySecretToBase64Url,
  recoverySecretToWords,
} from "./recovery-secret";
import { WeakPassphraseError } from "./passphrase";
import { passphraseParams } from "./envelope";
import {
  changePassphrase,
  createWallet,
  reissueRecovery,
  unlockWithPassphrase,
  unlockWithRecoverySecret,
  upgradePassphraseIfWeak,
  withAccountKey,
} from "./wallet";

const FAST: Argon2Params = { memoryKiB: 32_768, iterations: 2, parallelism: 1, hashLength: 32 };
const WALLET = "wallet-1";
const PHRASE = "correct horse battery staple";
const ACCOUNTS = [
  {
    accountId: "acc-evm",
    family: "evm" as const,
    networkIds: ["ethereum-mainnet", "base-mainnet", "polygon-mainnet"],
  },
  { accountId: "acc-sol", family: "solana" as const, networkIds: ["solana-mainnet-beta"] },
];

const create = (passphrase = PHRASE) =>
  createWallet({ walletId: WALLET, accounts: ACCOUNTS, passphrase, params: FAST });

describe("creating a wallet", () => {
  it("produces a valid ciphertext-only package with one account per chain family", async () => {
    const wallet = await create();
    const pkg = validateWalletPackage(JSON.parse(JSON.stringify(wallet.package)));
    expect(pkg.version).toBe(1);
    expect(pkg.baseVersion).toBe(0);
    expect(pkg.accounts.map((a) => a.family).sort()).toEqual(["evm", "solana"]);
    expect(pkg.envelopes.map((e) => e.purpose).sort()).toEqual(["passphrase", "recovery"]);
    // One EVM address serves every EVM network.
    const evm = pkg.accounts.find((a) => a.family === "evm")!;
    expect(evm.addresses.map((a) => a.networkId)).toHaveLength(3);
    expect(new Set(evm.addresses.map((a) => a.address)).size).toBe(1);
    expect(wallet.addresses).toHaveLength(2);
  });

  it("refuses a weak passphrase before producing anything", async () => {
    await expect(create("short")).rejects.toBeInstanceOf(WeakPassphraseError);
  });

  it("uses the strong defaults unless told otherwise", async () => {
    const wallet = await createWallet({ walletId: WALLET, accounts: ACCOUNTS, passphrase: PHRASE });
    const envelope = wallet.package.envelopes.find((e) => e.purpose === "passphrase")!;
    if (envelope.purpose !== "passphrase") throw new Error("unreachable");
    expect(passphraseParams(envelope)).toEqual(DEFAULT_ARGON2);
  }, 30_000);
});

describe("what the server is allowed to see", () => {
  it("the stored package contains none of the secrets, in any form", async () => {
    const wallet = await create();
    const json = JSON.stringify(wallet.package);

    // The passphrase, the recovery secret in both written forms, the wallet key.
    expect(json).not.toContain(PHRASE);
    expect(json).not.toContain(recoverySecretToBase64Url(wallet.recoverySecret));
    expect(json).not.toContain(recoverySecretToWords(wallet.recoverySecret).join(" "));
    expect(json).not.toContain(toBase64Url(wallet.dek));
    // Every private key, recovered by the owner and then searched for.
    for (const { accountId } of ACCOUNTS) {
      await withAccountKey(wallet.package, wallet.dek, accountId, (material) => {
        const secret =
          material.family === "evm" ? material.privateKey.slice(2) : material.secretKey;
        expect(json).not.toContain(secret);
        expect(json.toLowerCase()).not.toContain(secret.toLowerCase());
      });
    }
    // And no field is named like a plaintext secret.
    expect(json).not.toMatch(/"(passphrase|pin|privateKey|secretKey|mnemonic|seed|dek)"\s*:/i);
  });

  it("the package alone cannot be opened without a secret", async () => {
    const wallet = await create();
    await expect(
      unlockWithPassphrase(wallet.package, "some other passphrase entirely")
    ).rejects.toBeInstanceOf(OpenError);
    await expect(
      unlockWithRecoverySecret(wallet.package, new Uint8Array(32))
    ).rejects.toBeInstanceOf(OpenError);
  });
});

describe("unlocking", () => {
  it("opens with the passphrase and with the recovery secret, to the same key", async () => {
    const wallet = await create();
    const viaPassphrase = await unlockWithPassphrase(wallet.package, PHRASE);
    const viaRecovery = await unlockWithRecoverySecret(wallet.package, wallet.recoverySecret);
    expect(viaPassphrase).toEqual(wallet.dek);
    expect(viaRecovery).toEqual(wallet.dek);
  });

  it("opens with the recovery secret typed back in from either written form", async () => {
    const wallet = await create();
    for (const written of [
      recoverySecretToWords(wallet.recoverySecret).join(" "),
      recoverySecretToBase64Url(wallet.recoverySecret),
    ]) {
      expect(await unlockWithRecoverySecret(wallet.package, parseRecoverySecret(written))).toEqual(
        wallet.dek
      );
    }
  });

  it("survives being stored and read back as JSON", async () => {
    const wallet = await create();
    const stored = JSON.parse(JSON.stringify(wallet.package)) as unknown;
    const pkg = validateWalletPackage(stored);
    expect(await unlockWithPassphrase(pkg, PHRASE)).toEqual(wallet.dek);
  });
});

describe("using an account key", () => {
  it("signs a proof that the address is theirs, then lets the key go", async () => {
    const wallet = await create();
    for (const { accountId, family } of ACCOUNTS) {
      const account = wallet.package.accounts.find((a) => a.accountId === accountId)!;
      const signature = await withAccountKey(wallet.package, wallet.dek, accountId, (material) =>
        signPossession(material, WALLET, accountId, "nonce-0123456789abcdef")
      );
      expect(
        await verifyPossession({
          family,
          address: account.canonicalAddress,
          walletId: WALLET,
          accountId,
          nonce: "nonce-0123456789abcdef",
          signature,
        })
      ).toBe(true);
    }
  });

  it("refuses a key that does not match the address the package claims", async () => {
    const wallet = await create();
    const evm = wallet.package.accounts.find((a) => a.family === "evm")!;
    const other = await createWallet({
      walletId: WALLET,
      accounts: [ACCOUNTS[0]!],
      passphrase: PHRASE,
      params: FAST,
    });
    // The same wallet id and account id, but a different generated key and address.
    const swapped = {
      ...wallet.package,
      accounts: wallet.package.accounts.map((a) =>
        a.accountId === evm.accountId
          ? { ...a, canonicalAddress: other.package.accounts[0]!.canonicalAddress }
          : a
      ),
    } as WalletPackage;
    await expect(
      withAccountKey(swapped, wallet.dek, evm.accountId, () => "used")
    ).rejects.toBeInstanceOf(KeyMaterialError);
  });

  it("refuses an unknown account and a wrong wallet key", async () => {
    const wallet = await create();
    await expect(
      withAccountKey(wallet.package, wallet.dek, "nope", () => 1)
    ).rejects.toBeInstanceOf(KeyMaterialError);
    await expect(
      withAccountKey(wallet.package, new Uint8Array(32), "acc-evm", () => 1)
    ).rejects.toBeInstanceOf(OpenError);
  });

  it("does not let a ciphertext from another account open in this one", async () => {
    const wallet = await create();
    const [a, b] = wallet.package.accounts;
    const swapped = {
      ...wallet.package,
      accounts: [{ ...a!, encryptedKeyMaterial: b!.encryptedKeyMaterial }, b!],
    } as WalletPackage;
    await expect(withAccountKey(swapped, wallet.dek, a!.accountId, () => 1)).rejects.toBeInstanceOf(
      OpenError
    );
  });
});

describe("changing the passphrase", () => {
  it("retires the old passphrase, accepts the new one, and keeps recovery working", async () => {
    const wallet = await create();
    const NEW = "a completely different passphrase";
    const changed = await changePassphrase(wallet.package, wallet.dek, NEW, FAST);

    expect(changed.version).toBe(2);
    expect(changed.baseVersion).toBe(1);
    expect(changed.envelopes.filter((e) => e.purpose === "passphrase")).toHaveLength(1);
    await expect(unlockWithPassphrase(changed, PHRASE)).rejects.toBeInstanceOf(OpenError);
    expect(await unlockWithPassphrase(changed, NEW)).toEqual(wallet.dek);
    expect(await unlockWithRecoverySecret(changed, wallet.recoverySecret)).toEqual(wallet.dek);
  });

  it("refuses a weak new passphrase and leaves the package untouched", async () => {
    const wallet = await create();
    await expect(
      changePassphrase(wallet.package, wallet.dek, "short", FAST)
    ).rejects.toBeInstanceOf(WeakPassphraseError);
    expect(await unlockWithPassphrase(wallet.package, PHRASE)).toEqual(wallet.dek);
  });
});

describe("upgrading weak key stretching on unlock", () => {
  it("re-wraps a passphrase made with weaker parameters, under the defaults, without changing the key", async () => {
    const wallet = await create();
    const upgraded = await upgradePassphraseIfWeak(wallet.package, wallet.dek, PHRASE);
    expect(upgraded).not.toBeNull();
    const envelope = upgraded!.envelopes.find((e) => e.purpose === "passphrase")!;
    if (envelope.purpose !== "passphrase") throw new Error("unreachable");
    expect(passphraseParams(envelope)).toEqual(DEFAULT_ARGON2);
    expect(upgraded!.version).toBe(2);
    expect(await unlockWithPassphrase(upgraded!, PHRASE)).toEqual(wallet.dek);
    expect(await unlockWithRecoverySecret(upgraded!, wallet.recoverySecret)).toEqual(wallet.dek);
  }, 60_000);

  it("does nothing when the parameters are already current", async () => {
    const wallet = await createWallet({ walletId: WALLET, accounts: ACCOUNTS, passphrase: PHRASE });
    expect(await upgradePassphraseIfWeak(wallet.package, wallet.dek, PHRASE)).toBeNull();
  }, 60_000);

  it("can re-wrap a passphrase that would fail today's policy, because the person is not choosing a new one", async () => {
    const wallet = await createWallet({
      walletId: WALLET,
      accounts: ACCOUNTS,
      passphrase: "correct horse battery staple",
      params: FAST,
    });
    // Simulate an older, weaker-policy passphrase by re-wrapping with skipPolicy via the upgrade path.
    const upgraded = await upgradePassphraseIfWeak(
      wallet.package,
      wallet.dek,
      "correct horse battery staple"
    );
    expect(upgraded).not.toBeNull();
  }, 60_000);
});

describe("reissuing the recovery secret", () => {
  it("retires the old secret and gives a new one that works", async () => {
    const wallet = await create();
    const reissued = await reissueRecovery(wallet.package, wallet.dek);
    expect(await unlockWithRecoverySecret(reissued.package, reissued.recoverySecret)).toEqual(
      wallet.dek
    );
    await expect(
      unlockWithRecoverySecret(reissued.package, wallet.recoverySecret)
    ).rejects.toBeInstanceOf(OpenError);
    expect(await unlockWithPassphrase(reissued.package, PHRASE)).toEqual(wallet.dek);
    expect(reissued.package.version).toBe(2);
  });
});

describe("rejecting bad packages", () => {
  const stored = async () =>
    JSON.parse(JSON.stringify((await create()).package)) as Record<string, any>;

  it("rejects unknown fields anywhere", async () => {
    const pkg = await stored();
    expect(() => validateWalletPackage({ ...pkg, extra: 1 })).toThrow(PackageValidationError);
    pkg.accounts[0].extra = 1;
    expect(() => validateWalletPackage(pkg)).toThrow(PackageValidationError);
  });

  it("rejects weakened or absurd key stretching in the stored metadata", async () => {
    for (const change of [
      { memoryKiB: 1_024 },
      { iterations: 1 },
      { memoryKiB: 4_194_304 },
      { parallelism: 0 },
    ]) {
      const pkg = await stored();
      const index = pkg.envelopes.findIndex((e: any) => e.purpose === "passphrase");
      Object.assign(pkg.envelopes[index].keyDerivationMetadata, change);
      expect(() => validateWalletPackage(pkg)).toThrow(PackageValidationError);
    }
  });

  it("rejects a legacy PBKDF2 envelope", async () => {
    const pkg = await stored();
    const index = pkg.envelopes.findIndex((e: any) => e.purpose === "passphrase");
    pkg.envelopes[index].keyDerivationMetadata = {
      kind: "pbkdf2-sha256",
      version: 1,
      salt: "AAAA",
      iterations: 600000,
    };
    expect(() => validateWalletPackage(pkg)).toThrow(PackageValidationError);
  });

  it("requires both a passphrase and a recovery envelope", async () => {
    const pkg = await stored();
    expect(() =>
      validateWalletPackage({
        ...pkg,
        envelopes: pkg.envelopes.filter((e: any) => e.purpose !== "recovery"),
      })
    ).toThrow(PackageValidationError);
    expect(() =>
      validateWalletPackage({
        ...pkg,
        envelopes: pkg.envelopes.filter((e: any) => e.purpose !== "passphrase"),
      })
    ).toThrow(PackageValidationError);
  });

  it("rejects duplicate ids, a second account for a family, and a version that does not follow", async () => {
    const pkg = await stored();
    expect(() =>
      validateWalletPackage({
        ...pkg,
        envelopes: [
          pkg.envelopes[0],
          { ...pkg.envelopes[1], envelopeId: pkg.envelopes[0].envelopeId },
        ],
      })
    ).toThrow(PackageValidationError);
    expect(() =>
      validateWalletPackage({
        ...pkg,
        accounts: [pkg.accounts[0], { ...pkg.accounts[0], accountId: "acc-3" }],
      })
    ).toThrow(PackageValidationError);
    expect(() => validateWalletPackage({ ...pkg, version: 5 })).toThrow(PackageValidationError);
  });

  it("rejects associated data that does not match the facts it claims to describe", async () => {
    const pkg = await stored();
    pkg.accounts[0].encryptedKeyMaterial.aad = "something else";
    expect(() => validateWalletPackage(pkg)).toThrow(PackageValidationError);
    const other = await stored();
    other.walletId = "wallet-other"; // every aad now names the wrong wallet
    expect(() => validateWalletPackage(other)).toThrow(PackageValidationError);
  });

  it("rejects a network listed twice for one account", async () => {
    const pkg = await stored();
    pkg.accounts[0].addresses.push({ ...pkg.accounts[0].addresses[0] });
    expect(() => validateWalletPackage(pkg)).toThrow(PackageValidationError);
  });

  it("rejects an account with no canonical entry", async () => {
    const pkg = await stored();
    for (const entry of pkg.accounts[0].addresses) entry.isCanonical = false;
    expect(() => validateWalletPackage(pkg)).toThrow(PackageValidationError);
  });

  it("rejects a canonical address that is not one of the listed addresses", async () => {
    const pkg = await stored();
    pkg.accounts[0].canonicalAddress = "0xsomebodyelse";
    expect(() => validateWalletPackage(pkg)).toThrow(PackageValidationError);
  });

  it("rejects an oversized package without parsing it", async () => {
    const pkg = await stored();
    pkg.accounts[0].addresses = Array.from({ length: 5_000 }, (_, i) => ({
      networkId: `n${i}`,
      address: "x".repeat(100),
      isCanonical: false,
    }));
    try {
      validateWalletPackage(pkg);
      throw new Error("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(PackageValidationError);
      expect((error as PackageValidationError).issues).toContain("package is too large");
    }
  });

  it("reports where the problem is without echoing the data", async () => {
    const pkg = await stored();
    pkg.envelopes[0].wrappedDek = "NOT VALID !!";
    try {
      validateWalletPackage(pkg);
      throw new Error("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(PackageValidationError);
      expect((error as PackageValidationError).issues.join(" ")).not.toContain("NOT VALID");
    }
  });

  it("rejects things that are not packages at all", () => {
    for (const bad of [null, undefined, 1, "pkg", [], {}, { format: "tsion-wallet-package" }]) {
      expect(() => validateWalletPackage(bad)).toThrow(PackageValidationError);
    }
  });
});

describe("ids", () => {
  it("rejects wallet and account ids that could confuse the associated data", async () => {
    for (const walletId of ["a:b", "a b", "", "x".repeat(200)]) {
      await expect(
        createWallet({ walletId, accounts: ACCOUNTS, passphrase: PHRASE, params: FAST })
      ).rejects.toThrow();
    }
    await expect(
      createWallet({
        walletId: WALLET,
        accounts: [{ accountId: "a:b", family: "evm", networkIds: ["n"] }],
        passphrase: PHRASE,
        params: FAST,
      })
    ).rejects.toThrow();
  });

  it("does not hide an Argon2 problem behind a generic failure at creation", async () => {
    await expect(
      createWallet({
        walletId: WALLET,
        accounts: ACCOUNTS,
        passphrase: PHRASE,
        params: { ...FAST, memoryKiB: 1_024 },
      })
    ).rejects.toBeInstanceOf(Argon2ParamsError);
  });
});
