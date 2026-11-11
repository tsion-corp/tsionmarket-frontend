import { PACKAGE_FORMAT, PACKAGE_VERSION, assertId, type ChainFamily } from "./aad";
import { DEFAULT_ARGON2, isBelowDefault, type Argon2Params } from "./argon2";
import { OpenError } from "./crypto";
import { deriveAccount, wipeMaterial, type KeyMaterial } from "./derive";
import { randomBytes, wipeBytes } from "./encoding";
import {
  createPassphraseEnvelope,
  createRecoveryEnvelope,
  openPassphraseEnvelope,
  openRecoveryEnvelope,
  passphraseParams,
  type PassphraseEnvelope,
} from "./envelope";
import { entropyToWords, generatePhrase, parsePhrase, seedFromEntropy } from "./phrase";
import { validateWalletPackage, type PackageAccount, type WalletPackage } from "./package";
import { openRoot, sealRoot } from "./root";

/**
 * The wallet lifecycle, as pure functions over a package.
 *
 * Nothing here touches the network, storage or the screen: each function takes
 * a package and secrets and returns a new package (and, where relevant, the
 * secrets to show once). That keeps every security property testable, and lets
 * the same code run on a device and in a server-side validator.
 *
 * The package stores ONE secret, the recovery phrase, encrypted. Account keys
 * are derived from it on use and dropped straight after.
 */

const newId = () => crypto.randomUUID();

export class AccountError extends Error {
  constructor() {
    super("That account does not match this wallet.");
    this.name = "AccountError";
  }
}

export interface NewAccount {
  accountId: string;
  family: ChainFamily;
  /** Networks that share this address (every EVM chain shares one). */
  networkIds: ReadonlyArray<string>;
}

export interface CreatedWallet {
  /** Ciphertext only: safe to send to the server and to cache. */
  package: WalletPackage;
  /** The recovery phrase to show once (never stored in the clear). */
  phrase: Array<string>;
  /** True when the person brought their own phrase instead of getting a new one. */
  imported: boolean;
  /** The wallet key, for the unlocked session. Wipe when the session ends. */
  dek: Uint8Array;
  addresses: Array<{ accountId: string; family: ChainFamily; address: string }>;
}

/**
 * Create a wallet, or import one from an existing phrase.
 *
 * With `phrase`, the same keys the person already has elsewhere are derived,
 * and the phrase they typed becomes this wallet's recovery phrase. Without
 * one, a fresh 24-word phrase is generated.
 */
export async function createWallet(input: {
  walletId: string;
  accounts: ReadonlyArray<NewAccount>;
  passphrase: string;
  params?: Argon2Params;
  securityVersion?: number;
  phrase?: string | ReadonlyArray<string>;
}): Promise<CreatedWallet> {
  assertId(input.walletId, "wallet id");
  const parsed = input.phrase !== undefined ? parsePhrase(input.phrase) : generatePhrase();
  const seed = seedFromEntropy(parsed.entropy);
  const dek = randomBytes(32);
  try {
    const accounts: Array<PackageAccount> = [];
    const addresses: CreatedWallet["addresses"] = [];
    for (const spec of input.accounts) {
      assertId(spec.accountId, "account id");
      const derived = deriveAccount(spec.family, seed);
      wipeMaterial(derived.material);
      accounts.push({
        accountId: spec.accountId,
        family: spec.family,
        algorithm: derived.algorithm,
        keyType: "bip39-derived",
        derivationPath: derived.derivationPath,
        publicKey: derived.publicKey,
        canonicalAddress: derived.address,
        addresses: spec.networkIds.map((networkId) => ({
          networkId,
          address: derived.address,
          isCanonical: true,
        })),
      });
      addresses.push({ accountId: spec.accountId, family: spec.family, address: derived.address });
    }

    // The passphrase is checked (and stretched) before anything is sealed, so a
    // weak one fails before anything is shown or stored.
    const passphrase = await createPassphraseEnvelope({
      walletId: input.walletId,
      envelopeId: newId(),
      dek,
      passphrase: input.passphrase,
      ...(input.params ? { params: input.params } : {}),
    });
    const recovery = await createRecoveryEnvelope({
      walletId: input.walletId,
      envelopeId: newId(),
      dek,
      entropy: parsed.entropy,
    });
    const encryptedRoot = await sealRoot(dek, input.walletId, parsed.entropy);

    const pkg = validateWalletPackage({
      format: PACKAGE_FORMAT,
      formatVersion: PACKAGE_VERSION,
      walletId: input.walletId,
      version: 1,
      baseVersion: 0,
      securityVersion: input.securityVersion ?? 1,
      encryptedRoot,
      accounts,
      envelopes: [passphrase, recovery],
    });
    return {
      package: pkg,
      phrase: parsed.words,
      imported: input.phrase !== undefined,
      dek,
      addresses,
    };
  } catch (error) {
    wipeBytes(dek);
    throw error;
  } finally {
    wipeBytes(seed, parsed.entropy);
  }
}

/** Try each passphrase envelope; the wrong passphrase and no envelope look the same. */
export async function unlockWithPassphrase(
  pkg: WalletPackage,
  passphrase: string
): Promise<Uint8Array> {
  for (const envelope of pkg.envelopes) {
    if (envelope.purpose !== "passphrase") continue;
    try {
      return await openPassphraseEnvelope({ walletId: pkg.walletId, envelope, passphrase });
    } catch (error) {
      if (!(error instanceof OpenError)) throw error;
    }
  }
  throw new OpenError();
}

/** Unlock with the recovery phrase (the way back in when the passphrase is forgotten). */
export async function unlockWithPhrase(
  pkg: WalletPackage,
  phrase: string | ReadonlyArray<string>
): Promise<Uint8Array> {
  const { entropy } = parsePhrase(phrase);
  try {
    for (const envelope of pkg.envelopes) {
      if (envelope.purpose !== "recovery") continue;
      try {
        return await openRecoveryEnvelope({ walletId: pkg.walletId, envelope, entropy });
      } catch (error) {
        if (!(error instanceof OpenError)) throw error;
      }
    }
    throw new OpenError();
  } finally {
    wipeBytes(entropy);
  }
}

/** Show the phrase again. The caller must require a fresh unlock first. */
export async function revealPhrase(pkg: WalletPackage, dek: Uint8Array): Promise<Array<string>> {
  const entropy = await openRoot(dek, pkg.walletId, pkg.encryptedRoot);
  try {
    return entropyToWords(entropy);
  } finally {
    wipeBytes(entropy);
  }
}

/**
 * Derive one account's key for the duration of `run`, then wipe it.
 *
 * The derived key must produce the address the package claims for the account;
 * a package whose claim does not match its phrase is rejected, never used.
 */
export async function withAccountKey<T>(
  pkg: WalletPackage,
  dek: Uint8Array,
  accountId: string,
  run: (material: KeyMaterial) => Promise<T> | T
): Promise<T> {
  const account = pkg.accounts.find((item) => item.accountId === accountId);
  if (!account) throw new AccountError();
  const entropy = await openRoot(dek, pkg.walletId, pkg.encryptedRoot);
  const seed = seedFromEntropy(entropy);
  const derived = deriveAccount(account.family, seed);
  try {
    if (
      derived.address !== account.canonicalAddress ||
      derived.derivationPath !== account.derivationPath
    ) {
      throw new AccountError();
    }
    return await run(derived.material);
  } finally {
    wipeMaterial(derived.material);
    wipeBytes(entropy, seed);
  }
}

function next(pkg: WalletPackage, envelopes: WalletPackage["envelopes"]): WalletPackage {
  return validateWalletPackage({
    ...pkg,
    version: pkg.version + 1,
    baseVersion: pkg.version,
    envelopes,
  });
}

/** Replace the passphrase (fresh salt, current parameters). The recovery phrase still works. */
export async function changePassphrase(
  pkg: WalletPackage,
  dek: Uint8Array,
  newPassphrase: string,
  params?: Argon2Params
): Promise<WalletPackage> {
  const envelope = await createPassphraseEnvelope({
    walletId: pkg.walletId,
    envelopeId: newId(),
    dek,
    passphrase: newPassphrase,
    ...(params ? { params } : {}),
  });
  const kept = pkg.envelopes.filter((item) => item.purpose !== "passphrase");
  return next(pkg, [envelope, ...kept]);
}

/**
 * After a successful unlock, re-wrap the passphrase under today's defaults if
 * it was made with weaker ones. Same passphrase, same wallet key; only the
 * stretching changes. Returns null when nothing needed doing.
 */
export async function upgradePassphraseIfWeak(
  pkg: WalletPackage,
  dek: Uint8Array,
  passphrase: string
): Promise<WalletPackage | null> {
  const current = pkg.envelopes.find(
    (item): item is PassphraseEnvelope => item.purpose === "passphrase"
  );
  if (!current || !isBelowDefault(passphraseParams(current))) return null;
  const envelope = await createPassphraseEnvelope({
    walletId: pkg.walletId,
    envelopeId: newId(),
    dek,
    passphrase,
    params: DEFAULT_ARGON2,
    skipPolicy: true,
  });
  const kept = pkg.envelopes.filter((item) => item.purpose !== "passphrase");
  return next(pkg, [envelope, ...kept]);
}
