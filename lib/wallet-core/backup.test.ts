import { describe, expect, it } from "vitest";
import { createBackup, parseBackup, BACKUP_FORMAT, BackupError, MAX_BACKUP_BYTES } from "./backup";
import { toBase64Url } from "./encoding";
import { createDeviceEnvelope, DEVICE_SECRET_BYTES } from "./envelope";
import { randomBytes } from "./encoding";
import { validateWalletPackage } from "./package";
import { createWallet, unlockWithPassphrase, unlockWithRecoverySecret } from "./wallet";
import type { Argon2Params } from "./argon2";

const FAST: Argon2Params = { memoryKiB: 32_768, iterations: 2, parallelism: 1, hashLength: 32 };
const WALLET = "wallet-1";
const PASSPHRASE = "correct horse battery staple";
const ACCOUNTS = [
  { accountId: "acc-evm", family: "evm" as const, networkIds: ["evm"] },
  { accountId: "acc-sol", family: "solana" as const, networkIds: ["solana-mainnet"] },
];

const make = () =>
  createWallet({ walletId: WALLET, accounts: ACCOUNTS, passphrase: PASSPHRASE, params: FAST });

describe("a wallet backup", () => {
  it("round-trips the package, and the restored copy still opens with either secret", async () => {
    const wallet = await make();
    const { text, filename } = createBackup(wallet.package, new Date("2026-11-13T10:00:00Z"));
    expect(filename).toBe("ark-wallet-backup-wallet-1-2026-11-13.json");
    const restored = parseBackup(text);
    expect(restored).toEqual(wallet.package);
    expect(await unlockWithPassphrase(restored, PASSPHRASE)).toEqual(wallet.dek);
    expect(await unlockWithRecoverySecret(restored, wallet.recoverySecret)).toEqual(wallet.dek);
  });

  it("is ciphertext only: none of the secrets is in the file", async () => {
    const wallet = await make();
    const { text } = createBackup(wallet.package);
    const lower = text.toLowerCase();
    expect(text).not.toContain(PASSPHRASE);
    expect(lower).not.toContain(wallet.recoverySecret.toLowerCase());
    expect(lower).not.toContain(wallet.recoverySecret.replace(/-/g, "").toLowerCase());
    expect(text).not.toContain(toBase64Url(wallet.dek));
    expect(JSON.parse(text)).toMatchObject({
      format: BACKUP_FORMAT,
      formatVersion: 1,
      walletId: WALLET,
    });
  });

  it("leaves devices out, on the way out and on the way in", async () => {
    const wallet = await make();
    const device = await createDeviceEnvelope({
      walletId: WALLET,
      deviceId: "device-1",
      envelopeId: "dev-env-1",
      dek: wallet.dek,
      deviceSecret: randomBytes(DEVICE_SECRET_BYTES),
    });
    const withDevice = validateWalletPackage({
      ...wallet.package,
      envelopes: [...wallet.package.envelopes, device],
    });
    const { text } = createBackup(withDevice);
    expect(text).not.toContain("device-1");
    // A file that does carry one is accepted, minus the device.
    const hand = JSON.parse(text);
    hand.package.envelopes.push(device);
    const parsed = parseBackup(JSON.stringify(hand));
    expect(parsed.envelopes.some((e) => e.purpose === "device")).toBe(false);
  });

  it("refuses anything that is not exactly one backup", async () => {
    const wallet = await make();
    const good = JSON.parse(createBackup(wallet.package).text);
    const bad: unknown[] = [
      "not json",
      "",
      "[]",
      "null",
      "{}",
      { ...good, format: "something-else" },
      { ...good, formatVersion: 2 },
      { ...good, extra: 1 },
      { ...good, walletId: "other-wallet" },
      { ...good, version: 9 },
      { ...good, package: undefined },
      { ...good, package: { ...good.package, walletId: "other-wallet" } },
      {
        ...good,
        package: { ...good.package, encryptedRoot: { ...good.package.encryptedRoot, aad: "x" } },
      },
    ];
    for (const value of bad) {
      const text = typeof value === "string" ? value : JSON.stringify(value);
      expect(() => parseBackup(text), text.slice(0, 40)).toThrow(BackupError);
    }
  });

  it("refuses an oversized file before reading it", () => {
    expect(() => parseBackup("x".repeat(MAX_BACKUP_BYTES + 1))).toThrow(BackupError);
  });

  it("says what is wrong in plain words, without echoing the file", () => {
    try {
      parseBackup('{"secret":"hunter2"');
      throw new Error("should have thrown");
    } catch (error) {
      expect((error as Error).message).toMatch(/isn't a wallet backup file/);
      expect((error as Error).message).not.toContain("hunter2");
    }
  });
});
