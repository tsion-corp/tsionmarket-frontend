import {
  createWallet,
  authorizeDeviceMessage,
  clearUnlocked,
  deviceSigningKey,
  enrollMessage,
  isUnlocked,
  parsePhrase,
  randomBytes,
  revealPhrase,
  setUnlocked,
  signAsDevice,
  signPossession,
  signRecoveryChallenge,
  toBase64Url,
  unlockWithPassphrase,
  unlockWithPhrase,
  validateWalletPackage,
  withAccountKey,
  wipeBytes,
  type ChainFamily,
  type CreatedWallet,
  type NewAccount,
  type WalletPackage,
} from "@/lib/wallet-core";
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

/**
 * Register the wallet. Call only after the person has confirmed their recovery
 * phrase: from here on the service holds the only copy of the encrypted keys.
 */
export async function saveWallet(deps: Deps, uid: string, created: CreatedWallet): Promise<void> {
  const pkg = created.package;
  const device = newDevice();
  const signing = await deviceSigningKey(device.secret, pkg.walletId, device.deviceId);
  wipeBytes(signing.seed);

  const nonce = await deps.api.challenge("create");
  const proofs: Array<{ accountId: string; signature: string }> = [];
  for (const account of pkg.accounts) {
    const signature = await withAccountKey(pkg, created.dek, account.accountId, (material) =>
      signPossession(material, pkg.walletId, account.accountId, nonce)
    );
    proofs.push({ accountId: account.accountId, signature });
  }
  await deps.api.create({
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
  setUnlocked(uid, pkg.walletId, created.dek);
  wipeBytes(created.dek, device.secret);
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
  wipeBytes(dek);
}

/**
 * Register this browser using the recovery phrase: the way back after losing the
 * device, or the passphrase. It also opens the wallet.
 */
export async function recoverOnThisDevice(deps: Deps, uid: string, phrase: string): Promise<void> {
  const wallet = await fetchWallet(deps);
  const pkg = checked(wallet);
  const dek = await unlockWithPhrase(pkg, phrase);
  const { entropy } = parsePhrase(phrase);
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
      entropy,
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
  } finally {
    wipeBytes(dek, entropy, device.secret);
  }
}

/** Show the phrase again. Always asks for the passphrase afresh, however recently it was entered. */
export async function showRecoveryPhrase(deps: Deps, passphrase: string): Promise<Array<string>> {
  const wallet = await fetchWallet(deps);
  const pkg = checked(wallet);
  const dek = await unlockWithPassphrase(pkg, passphrase);
  try {
    return await revealPhrase(pkg, dek);
  } finally {
    wipeBytes(dek);
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
