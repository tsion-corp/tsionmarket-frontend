import {
  createBackup,
  createWallet,
  authorizeDeviceMessage,
  clearUnlocked,
  deviceSigningKey,
  enrollMessage,
  isUnlocked,
  parseBackup,
  parseRecoverySecret,
  randomBytes,
  setUnlocked,
  signAsDevice,
  signPossession,
  signRecoveryChallenge,
  toBase64Url,
  unlockWithPassphrase,
  unlockWithRecoverySecret,
  validateWalletPackage,
  withAccountKey,
  wipeBytes,
  type ChainFamily,
  type CreatedWallet,
  type NewAccount,
  type WalletPackage,
} from "@/lib/wallet-core";
import { setCustomWalletSession } from "@/lib/signer/session";
import type { DeviceStore } from "@/lib/wallet-device/store";
import type { ServerWallet, WalletApi } from "./wallet-api";

/**
 * Create, open and recover the wallet. Everything secret happens here, in the
 * browser; the service only ever receives ciphertext, public keys and signatures.
 *
 * One EVM address serves every EVM network, and the service makes accounts
 * permanent, so each family is one account with one generic network entry. Which
 * chains the wallet is used on is a matter for the app, never for the package.
 */

export const ACCOUNTS: ReadonlyArray<NewAccount> = [
  { accountId: "acc-evm", family: "evm", networkIds: ["evm"] },
  { accountId: "acc-sol", family: "solana", networkIds: ["solana-mainnet"] },
];

export interface Deps {
  api: WalletApi;
  devices: DeviceStore;
}

export type WalletState =
  | { kind: "none" }
  | { kind: "locked"; wallet: ServerWallet; deviceEnrolled: boolean }
  | { kind: "unlocked"; wallet: ServerWallet; deviceEnrolled: boolean };

export async function loadWalletState(deps: Deps, uid: string): Promise<WalletState> {
  const wallet = await deps.api.get();
  if (!wallet) return { kind: "none" };
  remember(uid, wallet);
  const record = await deps.devices.get(uid);
  const deviceEnrolled =
    record?.walletId === wallet.walletId &&
    wallet.devices.some((device) => device.deviceId === record.deviceId);
  return isUnlocked(uid, wallet.walletId)
    ? { kind: "unlocked", wallet, deviceEnrolled }
    : { kind: "locked", wallet, deviceEnrolled };
}

/** Make the keys and lock them. Slow on purpose (key stretching). Nothing leaves the device yet. */
export function prepareWallet(passphrase: string): Promise<CreatedWallet> {
  return createWallet({
    walletId: crypto.randomUUID(),
    accounts: ACCOUNTS,
    passphrase,
  });
}

function newDevice(): { deviceId: string; secret: Uint8Array } {
  return { deviceId: crypto.randomUUID(), secret: randomBytes(32) };
}

type RegisterBody = Parameters<WalletApi["create"]>[0];

/**
 * Register a wallet package with the service and this browser as its first device:
 * every account's key signs the challenge (proof it is theirs), and this browser's
 * own key is registered beside it. Shared by creating a wallet and restoring one.
 */
async function register(
  deps: Deps,
  uid: string,
  pkg: WalletPackage,
  dek: Uint8Array,
  send: (body: RegisterBody) => Promise<void>
): Promise<void> {
  const device = newDevice();
  const signing = await deviceSigningKey(device.secret, pkg.walletId, device.deviceId);
  wipeBytes(signing.seed);

  const nonce = await deps.api.challenge("create");
  const proofs: Array<{ accountId: string; signature: string }> = [];
  for (const account of pkg.accounts) {
    const signature = await withAccountKey(pkg, dek, account.accountId, (material) =>
      signPossession(material, pkg.walletId, account.accountId, nonce)
    );
    proofs.push({ accountId: account.accountId, signature });
  }
  await send({
    package: pkg,
    nonce,
    proofs,
    device: { deviceId: device.deviceId, publicKey: signing.publicKey },
  });
  await deps.devices.put({
    uid,
    walletId: pkg.walletId,
    deviceId: device.deviceId,
    secret: toBase64Url(device.secret),
  });
  setUnlocked(uid, pkg.walletId, dek);
  setCustomWalletSession({ uid, pkg });
  wipeBytes(device.secret);
}

/**
 * Register the wallet. Call only after the person has confirmed their recovery
 * secret: from here on the service holds the only copy of the encrypted keys.
 */
export async function saveWallet(deps: Deps, uid: string, created: CreatedWallet): Promise<void> {
  try {
    await register(deps, uid, created.package, created.dek, (body) => deps.api.create(body));
  } finally {
    wipeBytes(created.dek);
  }
}

/** What opens a backup: the passphrase it was made with, or the recovery secret. */
export type BackupCredential =
  { kind: "passphrase"; value: string } | { kind: "secret"; value: string };

/**
 * Put a wallet back from a backup file, for an account the service has no wallet
 * for. The file is opened here, in the browser, with the passphrase or the recovery
 * secret, and every account key then proves itself to the service: a file nobody can
 * open restores nothing. The service never sees either secret.
 */
export async function restoreFromBackup(
  deps: Deps,
  uid: string,
  backupText: string,
  credential: BackupCredential
): Promise<void> {
  const pkg = parseBackup(backupText);
  const dek =
    credential.kind === "passphrase"
      ? await unlockWithPassphrase(pkg, credential.value)
      : await unlockWithRecoverySecret(pkg, credential.value);
  try {
    await register(deps, uid, pkg, dek, (body) => deps.api.restore(body));
  } finally {
    wipeBytes(dek);
  }
}

/** The signed-in wallet's encrypted package as a backup file to download. */
export async function backupFile(deps: Deps): Promise<{ filename: string; text: string }> {
  const wallet = await fetchWallet(deps);
  return createBackup(checked(wallet));
}

/**
 * Note this account's package (ciphertext only) for the signer, so the app can show the
 * wallet's addresses and sign with it once the person unlocks it. A package that does not
 * validate is not remembered.
 */
function remember(uid: string, wallet: ServerWallet): void {
  try {
    setCustomWalletSession({ uid, pkg: checked(wallet) });
  } catch {
    // Never use a package that fails its own checks.
  }
}

/** The service's copy, checked here too so a bad answer is never trusted. */
function checked(wallet: ServerWallet): WalletPackage {
  return validateWalletPackage(wallet.package);
}

async function fetchWallet(deps: Deps): Promise<ServerWallet> {
  const wallet = await deps.api.get();
  if (!wallet) throw Object.assign(new Error("No wallet"), { code: "WALLET_NOT_FOUND" });
  return wallet;
}

export async function unlockWallet(deps: Deps, uid: string, passphrase: string): Promise<void> {
  const wallet = await fetchWallet(deps);
  const dek = await unlockWithPassphrase(checked(wallet), passphrase);
  setUnlocked(uid, wallet.walletId, dek);
  remember(uid, wallet);
  wipeBytes(dek);
}

/**
 * Register this browser using the recovery secret: the way back after losing the
 * device, or the passphrase. It also opens the wallet.
 */
export async function recoverOnThisDevice(deps: Deps, uid: string, written: string): Promise<void> {
  const wallet = await fetchWallet(deps);
  const pkg = checked(wallet);
  const dek = await unlockWithRecoverySecret(pkg, written);
  const secret = parseRecoverySecret(written);
  const device = newDevice();
  try {
    const signing = await deviceSigningKey(device.secret, pkg.walletId, device.deviceId);
    wipeBytes(signing.seed);
    const nonce = await deps.api.challenge("device");
    const enrollSignature = await signAsDevice(
      device.secret,
      pkg.walletId,
      device.deviceId,
      enrollMessage(pkg.walletId, device.deviceId, signing.publicKey, nonce)
    );
    const approval = await signRecoveryChallenge(
      secret,
      authorizeDeviceMessage(pkg.walletId, device.deviceId, signing.publicKey, nonce)
    );
    await deps.api.enrollDevice({
      deviceId: device.deviceId,
      publicKey: signing.publicKey,
      nonce,
      enrollSignature,
      authorization: { type: "recovery", signature: approval },
    });
    await deps.devices.put({
      uid,
      walletId: pkg.walletId,
      deviceId: device.deviceId,
      secret: toBase64Url(device.secret),
    });
    setUnlocked(uid, pkg.walletId, dek);
    setCustomWalletSession({ uid, pkg });
  } finally {
    wipeBytes(dek, secret, device.secret);
  }
}

export function lockWallet(): void {
  clearUnlocked();
}

/** The addresses the wallet claims, from the validated package. */
export function addressesOf(wallet: ServerWallet): Array<{ family: ChainFamily; address: string }> {
  return checked(wallet).accounts.map((account) => ({
    family: account.family,
    address: account.canonicalAddress,
  }));
}
