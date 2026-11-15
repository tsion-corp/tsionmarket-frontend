/* eslint-disable @typescript-eslint/no-explicit-any -- these tests deliberately corrupt untrusted-shaped JSON */
import { describe, expect, it } from "vitest";
import { DEFAULT_ARGON2, Argon2ParamsError, type Argon2Params } from "./argon2";
import { OpenError } from "./crypto";
import { deriveAccount } from "./derive";
import { passphraseParams } from "./envelope";
import { toBase64Url } from "./encoding";
import { PackageValidationError, validateWalletPackage, type WalletPackage } from "./package";
import { WeakPassphraseError } from "./passphrase";
import {
  RecoverySecretFormatError,
  encodeRecoverySecret,
  generateRecoverySecret,
  parseRecoverySecret,
} from "./recovery-secret";
import { openRoot, seedFromRoot } from "./root";
import { signPossession, verifyPossession } from "./proof";
import {
  AccountError,
  changePassphrase,
  createWallet,
  unlockWithPassphrase,
  unlockWithRecoverySecret,
  upgradePassphraseIfWeak,
  withAccountKey,
} from "./wallet";

const FAST: Argon2Params = { memoryKiB: 32_768, iterations: 2, parallelism: 1, hashLength: 32 };
const WALLET = "wallet-1";
const PHRASE_PASSPHRASE = "correct horse battery staple";
const ACCOUNTS = [
  {
    accountId: "acc-evm",
    family: "evm" as const,
    networkIds: ["ethereum-mainnet", "base-mainnet", "polygon-mainnet"],
  },
  { accountId: "acc-sol", family: "solana" as const, networkIds: ["solana-mainnet-beta"] },
];

const create = (extra: Partial<Parameters<typeof createWallet>[0]> = {}) =>
  createWallet({
    walletId: WALLET,
    accounts: ACCOUNTS,
    passphrase: PHRASE_PASSPHRASE,
    params: FAST,
    ...extra,
  });

describe("creating a wallet", () => {
  it("produces a valid ciphertext-only package and a written-down recovery secret", async () => {
    const wallet = await create();
    const pkg = validateWalletPackage(JSON.parse(JSON.stringify(wallet.package)));
    // 14 groups of four: 52 characters of secret and a 4-character checksum.
    expect(wallet.recoverySecret).toMatch(/^([0-9A-HJKMNP-TV-Z]{4}-){13}[0-9A-HJKMNP-TV-Z]{4}$/);
    expect(pkg.formatVersion).toBe(4);
    expect(pkg.version).toBe(1);
    expect(pkg.baseVersion).toBe(0);
    expect(pkg.accounts.map((a) => a.family).sort()).toEqual(["evm", "solana"]);
    expect(pkg.envelopes.map((e) => e.purpose).sort()).toEqual(["passphrase", "recovery"]);
    // One EVM address serves every EVM network.
    const evm = pkg.accounts.find((a) => a.family === "evm")!;
    expect(evm.addresses).toHaveLength(3);
    expect(new Set(evm.addresses.map((a) => a.address)).size).toBe(1);
    expect(wallet.addresses).toHaveLength(2);
  });

  it("refuses a weak passphrase before producing anything", async () => {
    await expect(create({ passphrase: "short" })).rejects.toBeInstanceOf(WeakPassphraseError);
  });

  it("uses the strong defaults unless told otherwise", async () => {
    const wallet = await createWallet({
      walletId: WALLET,
      accounts: ACCOUNTS,
      passphrase: PHRASE_PASSPHRASE,
    });
    const envelope = wallet.package.envelopes.find((e) => e.purpose === "passphrase")!;
    if (envelope.purpose !== "passphrase") throw new Error("unreachable");
    expect(passphraseParams(envelope)).toEqual(DEFAULT_ARGON2);
  }, 30_000);
});

describe("the recovery secret and the keys are independent", () => {
  it("derives the keys from a random root, not from the secret", async () => {
    const wallet = await create();
    const secret = parseRecoverySecret(wallet.recoverySecret);
    const root = await openRoot(wallet.dek, WALLET, wallet.package.encryptedRoot);
    expect(root).toHaveLength(32);
    expect(root).not.toEqual(secret);

    // The addresses come from the root...
    const fromRoot = await seedFromRoot(root);
    for (const family of ["evm", "solana"] as const) {
      expect(deriveAccount(family, fromRoot).address).toBe(
        wallet.addresses.find((a) => a.family === family)!.address
      );
    }
    // ...and the secret, run through the same derivation, reaches none of them.
    const fromSecret = await seedFromRoot(secret);
    for (const family of ["evm", "solana"] as const) {
      expect(deriveAccount(family, fromSecret).address).not.toBe(
        wallet.addresses.find((a) => a.family === family)!.address
      );
    }
  });

  it("gives every wallet its own keys, even on the same passphrase", async () => {
    const a = await create();
    const b = await create();
    expect(a.addresses.map((x) => x.address)).not.toEqual(b.addresses.map((x) => x.address));
    expect(a.recoverySecret).not.toBe(b.recoverySecret);
  });

  it("shows the secret as the text to write down, and only that: it is not kept anywhere", async () => {
    const wallet = await create();
    // Nothing on the returned wallet other than this one string holds the secret.
    const holders = Object.entries(wallet).filter(([, value]) =>
      JSON.stringify(value, (_k, v) => (v instanceof Uint8Array ? toBase64Url(v) : v)).includes(
        toBase64Url(parseRecoverySecret(wallet.recoverySecret))
      )
    );
    expect(holders).toEqual([]);
  });
});

describe("what the server is allowed to see", () => {
  it("the stored package contains none of the secrets, in any form", async () => {
    const wallet = await create();
    const json = JSON.stringify(wallet.package);
    const lower = json.toLowerCase();
    const secretBytes = parseRecoverySecret(wallet.recoverySecret);
    const hexOf = (bytes: Uint8Array) =>
      [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
    const root = await openRoot(wallet.dek, WALLET, wallet.package.encryptedRoot);

    expect(json).not.toContain(PHRASE_PASSPHRASE);
    // The recovery secret, however it might be spelled.
    for (const form of [
      wallet.recoverySecret,
      wallet.recoverySecret.replace(/-/g, ""),
      toBase64Url(secretBytes),
      hexOf(secretBytes),
    ]) {
      expect(lower).not.toContain(form.toLowerCase());
    }
    // No two consecutive groups of it either.
    const groups = wallet.recoverySecret.split("-");
    for (let i = 0; i + 1 < groups.length; i += 1) {
      expect(lower).not.toContain(
        groups
          .slice(i, i + 2)
          .join("")
          .toLowerCase()
      );
    }
    // The root and the wallet key.
    for (const secret of [root, wallet.dek]) {
      expect(json).not.toContain(toBase64Url(secret));
      expect(lower).not.toContain(hexOf(secret));
    }
    // Every derived private key and seed, found by the owner and then searched for.
    for (const { accountId } of ACCOUNTS) {
      await withAccountKey(wallet.package, wallet.dek, accountId, (material) => {
        const secret =
          material.family === "evm" ? material.privateKey.slice(2) : toBase64Url(material.seed);
        expect(lower).not.toContain(secret.toLowerCase());
        if (material.family === "solana") expect(lower).not.toContain(hexOf(material.seed));
      });
    }
    expect(json).not.toMatch(
      /"(passphrase|pin|privateKey|secretKey|mnemonic|seed|root|dek|phrase|entropy|recoverySecret|secret)"\s*:/i
    );
    // The old per-chain key storage no longer exists.
    expect(json).not.toContain("encryptedKeyMaterial");
  });

  it("the package alone cannot be opened without a secret", async () => {
    const wallet = await create();
    await expect(
      unlockWithPassphrase(wallet.package, "some other passphrase entirely")
    ).rejects.toBeInstanceOf(OpenError);
    await expect(
      unlockWithRecoverySecret(wallet.package, encodeRecoverySecret(generateRecoverySecret()))
    ).rejects.toBeInstanceOf(OpenError);
  });
});

describe("unlocking", () => {
  it("opens with the passphrase and with the recovery secret, to the same key", async () => {
    const wallet = await create();
    expect(await unlockWithPassphrase(wallet.package, PHRASE_PASSPHRASE)).toEqual(wallet.dek);
    expect(await unlockWithRecoverySecret(wallet.package, wallet.recoverySecret)).toEqual(
      wallet.dek
    );
    // However it was typed: lower case, spaces, no dashes.
    const typed = wallet.recoverySecret.toLowerCase().replace(/-/g, " ");
    expect(await unlockWithRecoverySecret(wallet.package, typed)).toEqual(wallet.dek);
  });

  it("survives being stored and read back as JSON", async () => {
    const wallet = await create();
    const pkg = validateWalletPackage(JSON.parse(JSON.stringify(wallet.package)));
    expect(await unlockWithPassphrase(pkg, PHRASE_PASSPHRASE)).toEqual(wallet.dek);
    expect(await unlockWithRecoverySecret(pkg, wallet.recoverySecret)).toEqual(wallet.dek);
  });

  it("separates a mistyped secret (fix the typo) from the wrong wallet's secret", async () => {
    const wallet = await create();
    const chars = wallet.recoverySecret.split("");
    const at = chars.findIndex((c) => c !== "-");
    chars[at] = chars[at] === "0" ? "1" : "0";
    await expect(unlockWithRecoverySecret(wallet.package, chars.join(""))).rejects.toBeInstanceOf(
      RecoverySecretFormatError
    );
    await expect(unlockWithRecoverySecret(wallet.package, "not a secret")).rejects.toBeInstanceOf(
      RecoverySecretFormatError
    );
    await expect(
      unlockWithRecoverySecret(wallet.package, encodeRecoverySecret(generateRecoverySecret()))
    ).rejects.toBeInstanceOf(OpenError);
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

  it("wipes the derived Solana seed after use", async () => {
    const wallet = await create();
    let kept: Uint8Array | undefined;
    await withAccountKey(wallet.package, wallet.dek, "acc-sol", (material) => {
      if (material.family === "solana") kept = material.seed;
    });
    expect(kept).toEqual(new Uint8Array(32));
  });

  it("refuses a package whose address claim does not match its root", async () => {
    const wallet = await create();
    const other = await create();
    const swapped = {
      ...wallet.package,
      accounts: wallet.package.accounts.map((a) =>
        a.family === "evm"
          ? { ...a, canonicalAddress: other.addresses.find((x) => x.family === "evm")!.address }
          : a
      ),
    } as WalletPackage;
    await expect(
      withAccountKey(swapped, wallet.dek, "acc-evm", () => "used")
    ).rejects.toBeInstanceOf(AccountError);
  });

  it("refuses a root swapped in from a different wallet", async () => {
    const wallet = await create();
    const other = await create();
    // Same wallet id, so the other root opens under its own wallet key, but it
    // derives different addresses from the ones this package claims.
    const swapped = {
      ...wallet.package,
      encryptedRoot: other.package.encryptedRoot,
    } as WalletPackage;
    await expect(withAccountKey(swapped, other.dek, "acc-evm", () => 1)).rejects.toBeInstanceOf(
      AccountError
    );
  });

  it("refuses an unknown account and a wrong wallet key", async () => {
    const wallet = await create();
    await expect(
      withAccountKey(wallet.package, wallet.dek, "nope", () => 1)
    ).rejects.toBeInstanceOf(AccountError);
    await expect(
      withAccountKey(wallet.package, new Uint8Array(32), "acc-evm", () => 1)
    ).rejects.toBeInstanceOf(OpenError);
  });

  it("refuses a root that belongs to another wallet id", async () => {
    const wallet = await create();
    const elsewhere = await createWalletWithId("wallet-other");
    const swapped = {
      ...wallet.package,
      encryptedRoot: elsewhere.package.encryptedRoot,
    } as WalletPackage;
    await expect(withAccountKey(swapped, elsewhere.dek, "acc-evm", () => 1)).rejects.toBeInstanceOf(
      OpenError
    );
  });
});

const createWalletWithId = (walletId: string) =>
  createWallet({ walletId, accounts: ACCOUNTS, passphrase: PHRASE_PASSPHRASE, params: FAST });

describe("changing the passphrase", () => {
  it("retires the old passphrase, accepts the new one, and keeps the recovery secret working", async () => {
    const wallet = await create();
    const NEW = "a completely different passphrase";
    const changed = await changePassphrase(wallet.package, wallet.dek, NEW, FAST);

    expect(changed.version).toBe(2);
    expect(changed.baseVersion).toBe(1);
    expect(changed.envelopes.filter((e) => e.purpose === "passphrase")).toHaveLength(1);
    await expect(unlockWithPassphrase(changed, PHRASE_PASSPHRASE)).rejects.toBeInstanceOf(
      OpenError
    );
    expect(await unlockWithPassphrase(changed, NEW)).toEqual(wallet.dek);
    expect(await unlockWithRecoverySecret(changed, wallet.recoverySecret)).toEqual(wallet.dek);
    // The root and the accounts are untouched.
    expect(changed.encryptedRoot).toEqual(wallet.package.encryptedRoot);
    expect(changed.accounts).toEqual(wallet.package.accounts);
  });

  it("refuses a weak new passphrase and leaves the package untouched", async () => {
    const wallet = await create();
    await expect(
      changePassphrase(wallet.package, wallet.dek, "short", FAST)
    ).rejects.toBeInstanceOf(WeakPassphraseError);
    expect(await unlockWithPassphrase(wallet.package, PHRASE_PASSPHRASE)).toEqual(wallet.dek);
  });
});

describe("upgrading weak key stretching on unlock", () => {
  it("re-wraps a passphrase made with weaker parameters, under the defaults, without changing the key", async () => {
    const wallet = await create();
    const upgraded = await upgradePassphraseIfWeak(wallet.package, wallet.dek, PHRASE_PASSPHRASE);
    expect(upgraded).not.toBeNull();
    const envelope = upgraded!.envelopes.find((e) => e.purpose === "passphrase")!;
    if (envelope.purpose !== "passphrase") throw new Error("unreachable");
    expect(passphraseParams(envelope)).toEqual(DEFAULT_ARGON2);
    expect(upgraded!.version).toBe(2);
    expect(await unlockWithPassphrase(upgraded!, PHRASE_PASSPHRASE)).toEqual(wallet.dek);
    expect(await unlockWithRecoverySecret(upgraded!, wallet.recoverySecret)).toEqual(wallet.dek);
  }, 60_000);

  it("does nothing when the parameters are already current", async () => {
    const wallet = await createWallet({
      walletId: WALLET,
      accounts: ACCOUNTS,
      passphrase: PHRASE_PASSPHRASE,
    });
    expect(await upgradePassphraseIfWeak(wallet.package, wallet.dek, PHRASE_PASSPHRASE)).toBeNull();
  }, 60_000);
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

  it("rejects the old per-chain key storage", async () => {
    const pkg = await stored();
    pkg.accounts[0].encryptedKeyMaterial = {
      ciphertext: "AAAA",
      iv: "AAAA",
      aad: "x",
      dekVersion: 1,
      encoding: "base64url",
    };
    expect(() => validateWalletPackage(pkg)).toThrow(PackageValidationError);
  });

  it("requires the encrypted root, bound to this wallet", async () => {
    const pkg = await stored();
    const without = { ...pkg };
    delete without.encryptedRoot;
    expect(() => validateWalletPackage(without)).toThrow(PackageValidationError);
    pkg.encryptedRoot.aad = "something else";
    expect(() => validateWalletPackage(pkg)).toThrow(PackageValidationError);
  });

  it("rejects an account path other than the standard one for its chain", async () => {
    const pkg = await stored();
    pkg.accounts[0].derivationPath = "m/44'/60'/0'/0/1";
    expect(() => validateWalletPackage(pkg)).toThrow(PackageValidationError);
    const other = await stored();
    other.accounts[0].derivationPath = "not a path";
    expect(() => validateWalletPackage(other)).toThrow(PackageValidationError);
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

  it("rejects a recovery envelope that claims the old phrase source", async () => {
    const pkg = await stored();
    const index = pkg.envelopes.findIndex((e: any) => e.purpose === "recovery");
    pkg.envelopes[index].keyDerivationMetadata.source = "recovery-phrase";
    expect(() => validateWalletPackage(pkg)).toThrow(PackageValidationError);
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

  it("rejects associated data that names the wrong wallet", async () => {
    const other = await stored();
    other.walletId = "wallet-other"; // every aad now names the wrong wallet
    expect(() => validateWalletPackage(other)).toThrow(PackageValidationError);
  });

  it("rejects a network listed twice, an account with no canonical entry, and a wrong canonical address", async () => {
    const dup = await stored();
    dup.accounts[0].addresses.push({ ...dup.accounts[0].addresses[0] });
    expect(() => validateWalletPackage(dup)).toThrow(PackageValidationError);

    const none = await stored();
    for (const entry of none.accounts[0].addresses) entry.isCanonical = false;
    expect(() => validateWalletPackage(none)).toThrow(PackageValidationError);

    const wrong = await stored();
    wrong.accounts[0].canonicalAddress = "0xsomebodyelse";
    expect(() => validateWalletPackage(wrong)).toThrow(PackageValidationError);
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
        createWallet({ walletId, accounts: ACCOUNTS, passphrase: PHRASE_PASSPHRASE, params: FAST })
      ).rejects.toThrow();
    }
    await expect(
      createWallet({
        walletId: WALLET,
        accounts: [{ accountId: "a:b", family: "evm", networkIds: ["n"] }],
        passphrase: PHRASE_PASSPHRASE,
        params: FAST,
      })
    ).rejects.toThrow();
  });

  it("does not hide an Argon2 problem behind a generic failure at creation", async () => {
    await expect(create({ params: { ...FAST, memoryKiB: 1_024 } })).rejects.toBeInstanceOf(
      Argon2ParamsError
    );
  });
});
