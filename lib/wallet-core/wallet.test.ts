/* eslint-disable @typescript-eslint/no-explicit-any -- these tests deliberately corrupt untrusted-shaped JSON */
import { describe, expect, it } from "vitest";
import { DEFAULT_ARGON2, Argon2ParamsError, type Argon2Params } from "./argon2";
import { OpenError } from "./crypto";
import { deriveAccount } from "./derive";
import { passphraseParams } from "./envelope";
import { toBase64Url } from "./encoding";
import { PackageValidationError, validateWalletPackage, type WalletPackage } from "./package";
import { WeakPassphraseError } from "./passphrase";
import { PhraseFormatError, generatePhrase, parsePhrase, seedFromEntropy } from "./phrase";
import { signPossession, verifyPossession } from "./proof";
import {
  AccountError,
  changePassphrase,
  createWallet,
  revealPhrase,
  unlockWithPassphrase,
  unlockWithPhrase,
  upgradePassphraseIfWeak,
  withAccountKey,
} from "./wallet";

const FAST: Argon2Params = { memoryKiB: 32_768, iterations: 2, parallelism: 1, hashLength: 32 };
const WALLET = "wallet-1";
const PHRASE_PASSPHRASE = "correct horse battery staple";
const ABANDON =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
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
  it("produces a valid ciphertext-only package and a 24-word recovery phrase", async () => {
    const wallet = await create();
    const pkg = validateWalletPackage(JSON.parse(JSON.stringify(wallet.package)));
    expect(wallet.phrase).toHaveLength(24);
    expect(wallet.imported).toBe(false);
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

describe("portability: the same phrase gives the same wallet anywhere", () => {
  it("reports the addresses any other wallet derives from the same words", async () => {
    const wallet = await create();
    const seed = seedFromEntropy(parsePhrase(wallet.phrase).entropy);
    for (const { accountId, family, address } of wallet.addresses) {
      expect(accountId).toBeDefined();
      expect(deriveAccount(family, seed).address).toBe(address);
    }
  });

  it("imports an existing phrase and arrives at the addresses MetaMask and Phantom show", async () => {
    const wallet = await create({ phrase: ABANDON });
    expect(wallet.imported).toBe(true);
    expect(wallet.phrase.join(" ")).toBe(ABANDON);
    const byFamily = Object.fromEntries(wallet.addresses.map((a) => [a.family, a.address]));
    expect(byFamily.evm).toBe("0x9858EfFD232B4033E47d90003D41EC34EcaEda94");
    expect(byFamily.solana).toBe("HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk");
  });

  it("makes the imported phrase this wallet's recovery phrase", async () => {
    const wallet = await create({ phrase: ABANDON });
    expect(await unlockWithPhrase(wallet.package, ABANDON)).toEqual(wallet.dek);
    expect(await unlockWithPassphrase(wallet.package, PHRASE_PASSPHRASE)).toEqual(wallet.dek);
  });

  it("imports a 12-word phrase and a differently spaced, upper-case one", async () => {
    const twelve = generatePhrase(12);
    const wallet = await create({ phrase: twelve.words.join("   ").toUpperCase() });
    expect(wallet.phrase).toEqual(twelve.words);
    expect(await unlockWithPhrase(wallet.package, twelve.words)).toEqual(wallet.dek);
  });

  it("refuses to import a phrase that fails its checksum, leaving nothing behind", async () => {
    const words = generatePhrase().words;
    const bad = [words[0] === "abandon" ? "ability" : "abandon", ...words.slice(1)];
    await expect(create({ phrase: bad })).rejects.toBeInstanceOf(PhraseFormatError);
    await expect(create({ phrase: "not a phrase" })).rejects.toBeInstanceOf(PhraseFormatError);
  });
});

describe("what the server is allowed to see", () => {
  it("the stored package contains none of the secrets, in any form", async () => {
    const wallet = await create();
    const json = JSON.stringify(wallet.package);
    const lower = json.toLowerCase();
    const parsed = parsePhrase(wallet.phrase);

    expect(json).not.toContain(PHRASE_PASSPHRASE);
    expect(lower).not.toContain(wallet.phrase.join(" "));
    // No run of three consecutive phrase words, however they are joined.
    for (let i = 0; i + 2 < wallet.phrase.length; i += 1) {
      expect(lower).not.toContain(wallet.phrase.slice(i, i + 3).join(""));
      expect(lower).not.toContain(wallet.phrase.slice(i, i + 3).join(" "));
    }
    expect(json).not.toContain(toBase64Url(parsed.entropy));
    expect(json).not.toContain(toBase64Url(wallet.dek));
    // Every derived private key and seed, found by the owner and then searched for.
    for (const { accountId } of ACCOUNTS) {
      await withAccountKey(wallet.package, wallet.dek, accountId, (material) => {
        const secret =
          material.family === "evm" ? material.privateKey.slice(2) : toBase64Url(material.seed);
        expect(lower).not.toContain(secret.toLowerCase());
        if (material.family === "solana") {
          expect(lower).not.toContain(
            [...material.seed].map((b) => b.toString(16).padStart(2, "0")).join("")
          );
        }
      });
    }
    expect(json).not.toMatch(
      /"(passphrase|pin|privateKey|secretKey|mnemonic|seed|dek|phrase|entropy)"\s*:/i
    );
    // The old per-chain key storage no longer exists.
    expect(json).not.toContain("encryptedKeyMaterial");
  });

  it("the package alone cannot be opened without a secret", async () => {
    const wallet = await create();
    await expect(
      unlockWithPassphrase(wallet.package, "some other passphrase entirely")
    ).rejects.toBeInstanceOf(OpenError);
    await expect(unlockWithPhrase(wallet.package, generatePhrase().words)).rejects.toBeInstanceOf(
      OpenError
    );
  });
});

describe("unlocking", () => {
  it("opens with the passphrase and with the phrase, to the same key", async () => {
    const wallet = await create();
    expect(await unlockWithPassphrase(wallet.package, PHRASE_PASSPHRASE)).toEqual(wallet.dek);
    expect(await unlockWithPhrase(wallet.package, wallet.phrase)).toEqual(wallet.dek);
    expect(await unlockWithPhrase(wallet.package, wallet.phrase.join(" "))).toEqual(wallet.dek);
  });

  it("survives being stored and read back as JSON", async () => {
    const wallet = await create();
    const pkg = validateWalletPackage(JSON.parse(JSON.stringify(wallet.package)));
    expect(await unlockWithPassphrase(pkg, PHRASE_PASSPHRASE)).toEqual(wallet.dek);
    expect(await unlockWithPhrase(pkg, wallet.phrase)).toEqual(wallet.dek);
  });

  it("separates a mistyped phrase (fix the typo) from the wrong wallet's phrase", async () => {
    const wallet = await create();
    const words = wallet.phrase;
    const typo = [words[0] === "abandon" ? "ability" : "abandon", ...words.slice(1)];
    await expect(unlockWithPhrase(wallet.package, typo)).rejects.toBeInstanceOf(PhraseFormatError);
    await expect(unlockWithPhrase(wallet.package, generatePhrase().words)).rejects.toBeInstanceOf(
      OpenError
    );
  });
});

describe("showing the phrase again", () => {
  it("returns the same words once the wallet is unlocked", async () => {
    const wallet = await create();
    expect(await revealPhrase(wallet.package, wallet.dek)).toEqual(wallet.phrase);
    const viaPassphrase = await unlockWithPassphrase(wallet.package, PHRASE_PASSPHRASE);
    expect(await revealPhrase(wallet.package, viaPassphrase)).toEqual(wallet.phrase);
  });

  it("does not work without the real wallet key", async () => {
    const wallet = await create();
    await expect(revealPhrase(wallet.package, new Uint8Array(32))).rejects.toBeInstanceOf(
      OpenError
    );
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

  it("refuses a package whose address claim does not match its phrase", async () => {
    const wallet = await create();
    const other = await create({ phrase: ABANDON });
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

  it("refuses a root swapped in from a different phrase", async () => {
    const wallet = await create();
    const other = await create({ phrase: ABANDON });
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
  it("retires the old passphrase, accepts the new one, and keeps the phrase working", async () => {
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
    expect(await unlockWithPhrase(changed, wallet.phrase)).toEqual(wallet.dek);
    // The phrase and the accounts are untouched.
    expect(await revealPhrase(changed, wallet.dek)).toEqual(wallet.phrase);
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
    expect(await unlockWithPhrase(upgraded!, wallet.phrase)).toEqual(wallet.dek);
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

  it("rejects a recovery envelope that claims the old random-secret source", async () => {
    const pkg = await stored();
    const index = pkg.envelopes.findIndex((e: any) => e.purpose === "recovery");
    pkg.envelopes[index].keyDerivationMetadata.source = "recovery-secret";
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
