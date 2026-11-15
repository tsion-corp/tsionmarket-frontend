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
import {
  encodeRecoverySecret,
  generateRecoverySecret,
  parseRecoverySecret,
} from "./recovery-secret";
import { validateWalletPackage, type PackageAccount, type WalletPackage } from "./package";
import { ROOT_BYTES, openRoot, sealRoot, seedFromRoot } from "./root";

/**
 * The wallet lifecycle, as pure functions over a package.
 *
 * Nothing here touches the network, storage or the screen: each function takes
 * a package and secrets and returns a new package (and, where relevant, the
 * secrets to show once). That keeps every security property testable, and lets
 * the same code run on a device and in a server-side validator.
 *
 * The package stores ONE key secret, a random root, sealed under the wallet key.
 * Account keys are derived from it on use and dropped straight after. The recovery
 * secret is not that root: it only opens an envelope holding the wallet key.
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
  /**
   * The recovery secret, as written down: 14 groups of four. Shown once and never
   * stored (the package holds only an envelope that it opens), so it cannot be
   * shown again.
   */
  recoverySecret: string;
  /** The wallet key, for the unlocked session. Wipe when the session ends. */
  dek: Uint8Array;
  addresses: Array<{ accountId: string; family: ChainFamily; address: string }>;
}

/**
 * Create a wallet.
 *
 * Three independent random values are made: the wallet key (DEK), the root every
 * account key is derived from, and the recovery secret. The root is sealed under the
 * DEK; the DEK is wrapped once by the passphrase and once by the recovery secret.
 * Nothing but the passphrase and the recovery secret can open the DEK, and the
 * recovery secret alone reaches no key without the package.
 */
export async function createWallet(input: {
  walletId: string;
  accounts: ReadonlyArray<NewAccount>;
  passphrase: string;
  params?: Argon2Params;
  securityVersion?: number;
}): Promise<CreatedWallet> {
  assertId(input.walletId, "wallet id");
  const root = randomBytes(ROOT_BYTES);
  const secret = generateRecoverySecret();
  const seed = await seedFromRoot(root);
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
        keyType: "root-derived",
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
      secret,
    });
    const encryptedRoot = await sealRoot(dek, input.walletId, root);

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
    return { package: pkg, recoverySecret: encodeRecoverySecret(secret), dek, addresses };
  } catch (error) {
    wipeBytes(dek);
    throw error;
  } finally {
    wipeBytes(root, seed, secret);
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

/**
 * Unlock with the recovery secret, as written down (any case or spacing): the way
 * back in when the passphrase is forgotten. Throws RecoverySecretFormatError for
 * something that is not a valid secret, and OpenError for a valid one that is not
 * this wallet's.
 */
export async function unlockWithRecoverySecret(
  pkg: WalletPackage,
  written: string
): Promise<Uint8Array> {
  const secret = parseRecoverySecret(written);
  try {
    for (const envelope of pkg.envelopes) {
      if (envelope.purpose !== "recovery") continue;
      try {
        return await openRecoveryEnvelope({ walletId: pkg.walletId, envelope, secret });
      } catch (error) {
        if (!(error instanceof OpenError)) throw error;
      }
    }
    throw new OpenError();
  } finally {
    wipeBytes(secret);
  }
}

/**
 * Derive one account's key for the duration of `run`, then wipe it.
 *
 * The derived key must produce the address the package claims for the account;
 * a package whose claim does not match its root is rejected, never used.
 */
export async function withAccountKey<T>(
  pkg: WalletPackage,
  dek: Uint8Array,
  accountId: string,
  run: (material: KeyMaterial) => Promise<T> | T
): Promise<T> {
  const account = pkg.accounts.find((item) => item.accountId === accountId);
  if (!account) throw new AccountError();
  const root = await openRoot(dek, pkg.walletId, pkg.encryptedRoot);
  const seed = await seedFromRoot(root);
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
    wipeBytes(root, seed);
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

/** Replace the passphrase (fresh salt, current parameters). The recovery secret still works. */
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
