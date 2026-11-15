import { z } from "zod";
import { PackageValidationError, validateWalletPackage, type WalletPackage } from "./package";

/**
 * A backup of the wallet: the encrypted package in a file the person keeps.
 *
 * It is ciphertext only, so it is safe to store anywhere, but on its own it opens
 * nothing: it needs the passphrase or the recovery secret. It exists because the
 * server's copy of the package is the only other copy of the keys. With the file, a
 * lost or reset account can be put back, and the wallet survives without us.
 *
 * Devices are left out: each is registered with the key it holds, and a restored
 * wallet starts with the browser it is restored on.
 */

export const BACKUP_FORMAT = "tsion-wallet-backup";
export const BACKUP_VERSION = 1;
/** A package is at most 256 KiB; the wrapper adds little. */
export const MAX_BACKUP_BYTES = 320 * 1024;

export class BackupError extends Error {
  constructor(message = "That isn't a wallet backup file, or it has been changed.") {
    super(message);
    this.name = "BackupError";
  }
}

const backupFile = z.strictObject({
  format: z.literal(BACKUP_FORMAT),
  formatVersion: z.literal(BACKUP_VERSION),
  exportedAt: z.string().max(40),
  walletId: z.string().max(128),
  version: z.number().int().min(1),
  /** For the person to recognise the wallet by. Never trusted: the package is. */
  addresses: z
    .array(z.strictObject({ family: z.enum(["evm", "solana"]), address: z.string().max(128) }))
    .max(8),
  package: z.unknown(),
});

const withoutDevices = (pkg: WalletPackage): WalletPackage => ({
  ...pkg,
  envelopes: pkg.envelopes.filter((envelope) => envelope.purpose !== "device"),
});

export function createBackup(
  pkg: WalletPackage,
  now: Date = new Date()
): { filename: string; text: string } {
  const clean = validateWalletPackage(withoutDevices(pkg));
  const file = {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_VERSION,
    exportedAt: now.toISOString(),
    walletId: clean.walletId,
    version: clean.version,
    addresses: clean.accounts.map((account) => ({
      family: account.family,
      address: account.canonicalAddress,
    })),
    package: clean,
  };
  const day = now.toISOString().slice(0, 10);
  return {
    filename: `ark-wallet-backup-${clean.walletId.slice(0, 8)}-${day}.json`,
    text: JSON.stringify(file, null, 2),
  };
}

/** The package inside a backup file. Anything that is not exactly one valid backup throws BackupError. */
export function parseBackup(text: string): WalletPackage {
  if (new TextEncoder().encode(text).length > MAX_BACKUP_BYTES) throw new BackupError();
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new BackupError();
  }
  const parsed = backupFile.safeParse(raw);
  if (!parsed.success) throw new BackupError();
  try {
    const pkg = validateWalletPackage(parsed.data.package);
    // The labels must agree with the package they sit beside: a mismatch means the
    // file was edited by hand.
    if (pkg.walletId !== parsed.data.walletId || pkg.version !== parsed.data.version) {
      throw new BackupError();
    }
    return validateWalletPackage(withoutDevices(pkg));
  } catch (error) {
    if (error instanceof BackupError) throw error;
    if (error instanceof PackageValidationError) throw new BackupError();
    throw error;
  }
}
