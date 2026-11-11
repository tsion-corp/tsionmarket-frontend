import { aadAccount, assertId, type ChainFamily } from "./aad";
import { DEFAULT_ARGON2, isBelowDefault, type Argon2Params } from "./argon2";
import { OpenError, open, seal } from "./crypto";
import { randomBytes, wipeBytes } from "./encoding";
import {
  createPassphraseEnvelope,
  createRecoveryEnvelope,
  generateRecoverySecret,
  openPassphraseEnvelope,
  openRecoveryEnvelope,
  passphraseParams,
  type PassphraseEnvelope,
  type RecoveryEnvelope,
} from "./envelope";
import {
  KeyMaterialError,
  addressOf,
  generateAccount,
  parseKeyMaterial,
  type KeyMaterial,
} from "./keygen";
import { validateWalletPackage, type PackageAccount, type WalletPackage } from "./package";
import { PACKAGE_FORMAT, PACKAGE_VERSION } from "./aad";

/**
 * The wallet lifecycle, as pure functions over a package.
 *
 * Nothing here touches the network, storage or the screen: each function takes
 * a package and secrets and returns a new package (and, where relevant, the
 * secrets to show once). That keeps every security property testable, and lets
 * the same code run on a device and in a server-side validator.
 */

const newId = () => crypto.randomUUID();

export interface NewAccount {
  accountId: string;
  family: ChainFamily;
  /** Networks that share this address (every EVM chain shares one). */
  networkIds: ReadonlyArray<string>;
}

export interface CreatedWallet {
  /** Ciphertext only: safe to send to the server and to cache. */
  package: WalletPackage;
  /** Shown to the person once, never stored. Wipe after display. */
  recoverySecret: Uint8Array;
  /** The wallet key, for the unlocked session. Wipe when the session ends. */
  dek: Uint8Array;
  addresses: Array<{ accountId: string; family: ChainFamily; address: string }>;
}

export async function createWallet(input: {
  walletId: string;
  accounts: ReadonlyArray<NewAccount>;
  passphrase: string;
  params?: Argon2Params;
  securityVersion?: number;
}): Promise<CreatedWallet> {
  assertId(input.walletId, "wallet id");
  const dek = randomBytes(32);
  const accounts: Array<PackageAccount> = [];
  const addresses: CreatedWallet["addresses"] = [];

  for (const spec of input.accounts) {
    assertId(spec.accountId, "account id");
    const generated = generateAccount(spec.family);
    const sealed = await seal(
      dek,
      generated.plaintext,
      aadAccount(input.walletId, spec.accountId, spec.family)
    );
    wipeBytes(generated.plaintext);
    accounts.push({
      accountId: spec.accountId,
      family: spec.family,
      algorithm: generated.algorithm,
      keyType: "private-key",
      publicKey: generated.publicKey,
      canonicalAddress: generated.address,
      addresses: spec.networkIds.map((networkId) => ({
        networkId,
        address: generated.address,
        isCanonical: true,
      })),
      encryptedKeyMaterial: {
        ciphertext: sealed.ciphertext,
        iv: sealed.iv,
        aad: aadAccount(input.walletId, spec.accountId, spec.family),
        dekVersion: 1,
        encoding: "base64url",
      },
    });
    addresses.push({ accountId: spec.accountId, family: spec.family, address: generated.address });
  }

  // The passphrase is checked (and stretched) first so a weak one fails before
  // anything is shown or stored.
  const passphrase = await createPassphraseEnvelope({
    walletId: input.walletId,
    envelopeId: newId(),
    dek,
    passphrase: input.passphrase,
    ...(input.params ? { params: input.params } : {}),
  });
  const recoverySecret = generateRecoverySecret();
  const recovery = await createRecoveryEnvelope({
    walletId: input.walletId,
    envelopeId: newId(),
    dek,
    recoverySecret,
  });

  const pkg = validateWalletPackage({
    format: PACKAGE_FORMAT,
    formatVersion: PACKAGE_VERSION,
    walletId: input.walletId,
    version: 1,
    baseVersion: 0,
    securityVersion: input.securityVersion ?? 1,
    accounts,
    envelopes: [passphrase, recovery],
  });
  return { package: pkg, recoverySecret, dek, addresses };
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

export async function unlockWithRecoverySecret(
  pkg: WalletPackage,
  recoverySecret: Uint8Array
): Promise<Uint8Array> {
  for (const envelope of pkg.envelopes) {
    if (envelope.purpose !== "recovery") continue;
    try {
      return await openRecoveryEnvelope({ walletId: pkg.walletId, envelope, recoverySecret });
    } catch (error) {
      if (!(error instanceof OpenError)) throw error;
    }
  }
  throw new OpenError();
}

/**
 * Decrypt one account's key for the duration of `run`, then wipe it.
 *
 * The decrypted key must derive the address the package claims for the account;
 * a blob that opens to a different key is rejected, never used.
 */
export async function withAccountKey<T>(
  pkg: WalletPackage,
  dek: Uint8Array,
  accountId: string,
  run: (material: KeyMaterial) => Promise<T> | T
): Promise<T> {
  const account = pkg.accounts.find((item) => item.accountId === accountId);
  if (!account) throw new KeyMaterialError();
  const plaintext = await open(
    dek,
    { iv: account.encryptedKeyMaterial.iv, ciphertext: account.encryptedKeyMaterial.ciphertext },
    aadAccount(pkg.walletId, account.accountId, account.family)
  );
  try {
    const material = parseKeyMaterial(plaintext);
    if (material.family !== account.family || addressOf(material) !== account.canonicalAddress) {
      throw new KeyMaterialError();
    }
    return await run(material);
  } finally {
    wipeBytes(plaintext);
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

/** Issue a new recovery secret and retire the old one. */
export async function reissueRecovery(
  pkg: WalletPackage,
  dek: Uint8Array
): Promise<{ package: WalletPackage; recoverySecret: Uint8Array }> {
  const recoverySecret = generateRecoverySecret();
  const envelope: RecoveryEnvelope = await createRecoveryEnvelope({
    walletId: pkg.walletId,
    envelopeId: newId(),
    dek,
    recoverySecret,
  });
  const kept = pkg.envelopes.filter((item) => item.purpose !== "recovery");
  return { package: next(pkg, [...kept, envelope]), recoverySecret };
}
