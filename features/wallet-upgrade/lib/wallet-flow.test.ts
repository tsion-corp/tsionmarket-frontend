import { afterEach, describe, expect, it } from "vitest";
import {
  authorizeDeviceMessage,
  clearUnlocked,
  enrollMessage,
  isUnlocked,
  OpenError,
  RecoverySecretFormatError,
  encodeRecoverySecret,
  generateRecoverySecret,
  verifyDeviceSignature,
  verifyPossession,
  verifyRecoverySignature,
  type WalletPackage,
} from "@/lib/wallet-core";
import { memoryDeviceStore } from "@/lib/wallet-device/store";
import type { Authorization, ServerWallet, WalletApi } from "./wallet-api";
import {
  loadWalletState,
  lockWallet,
  prepareWallet,
  recoverOnThisDevice,
  saveWallet,
  unlockWallet,
  addressesOf,
  type Deps,
} from "./wallet-flow";

const UID = "6f1d2c1e-9c7a-4b7e-8a2f-0d3c4e5f6a7b";

/**
 * A stand-in for the wallet service that checks what the real one checks: every
 * account's proof of possession, the new device's own signature, and the
 * recovery key's approval. If the browser builds a message the service would
 * refuse, these fail, so the two cannot quietly drift apart.
 */
function fakeService() {
  let wallet: ServerWallet | null = null;
  let recoveryKey = "";
  const live = new Set<string>();
  const log: string[] = [];
  const issue = () => {
    const nonce = crypto.randomUUID().replace(/-/g, "") + "AAAA";
    live.add(nonce);
    return nonce;
  };
  const spend = (nonce: string) => {
    if (!live.delete(nonce)) throw Object.assign(new Error("x"), { code: "CHALLENGE_INVALID" });
  };
  const api: WalletApi = {
    get: async () => (wallet ? structuredClone(wallet) : null),
    challenge: async () => issue(),
    async create(body) {
      spend(body.nonce);
      const pkg = body.package;
      for (const account of pkg.accounts) {
        const proof = body.proofs.find((p) => p.accountId === account.accountId);
        const ok =
          proof &&
          (await verifyPossession({
            family: account.family,
            address: account.canonicalAddress,
            walletId: pkg.walletId,
            accountId: account.accountId,
            nonce: body.nonce,
            signature: proof.signature,
          }));
        if (!ok) throw Object.assign(new Error("x"), { code: "PROOF_INVALID" });
      }
      const recovery = pkg.envelopes.find((e) => e.purpose === "recovery");
      recoveryKey = recovery && "recoveryPublicKey" in recovery ? recovery.recoveryPublicKey : "";
      wallet = {
        walletId: pkg.walletId,
        version: 1,
        securityVersion: 1,
        digest: "d",
        package: pkg,
        devices: [body.device],
      };
      log.push("create");
    },
    async commit() {
      throw new Error("not used");
    },
    async enrollDevice(body) {
      spend(body.nonce);
      if (!wallet) throw new Error("no wallet");
      const own = enrollMessage(wallet.walletId, body.deviceId, body.publicKey, body.nonce);
      if (!verifyDeviceSignature(body.publicKey, own, body.enrollSignature)) {
        throw Object.assign(new Error("x"), { code: "NOT_AUTHORIZED" });
      }
      const approve = authorizeDeviceMessage(
        wallet.walletId,
        body.deviceId,
        body.publicKey,
        body.nonce
      );
      const auth: Authorization = body.authorization;
      const ok =
        auth.type === "recovery" && verifyRecoverySignature(recoveryKey, approve, auth.signature);
      if (!ok) throw Object.assign(new Error("x"), { code: "NOT_AUTHORIZED" });
      wallet.devices.push({ deviceId: body.deviceId, publicKey: body.publicKey });
      log.push("enroll");
    },
  };
  return {
    api,
    log,
    get wallet() {
      return wallet;
    },
  };
}

const PASSPHRASE = "correct horse battery staple";

async function created(deps: Deps) {
  const made = await prepareWallet(PASSPHRASE);
  const secret = made.recoverySecret;
  await saveWallet(deps, UID, made);
  return secret;
}

afterEach(() => clearUnlocked());

describe("the wallet flow", () => {
  it("creates a wallet the service accepts, registers this device, and leaves it unlocked", async () => {
    const service = fakeService();
    const deps: Deps = { api: service.api, devices: memoryDeviceStore() };
    expect((await loadWalletState(deps, UID)).kind).toBe("none");

    const secret = await created(deps);
    expect(secret.split("-")).toHaveLength(14);
    const state = await loadWalletState(deps, UID);
    expect(state).toMatchObject({ kind: "unlocked", deviceEnrolled: true });
    expect(service.log).toEqual(["create"]);
    const record = await deps.devices.get(UID);
    expect(record?.walletId).toBe(service.wallet?.walletId);
    // The service got ciphertext only: the secret appears nowhere in what it stored.
    const stored = JSON.stringify(service.wallet).toUpperCase();
    expect(stored.includes(secret)).toBe(false);
    expect(stored.includes(secret.replace(/-/g, ""))).toBe(false);
    for (const group of secret.split("-")) expect(stored.includes(`"${group}"`)).toBe(false);
  }, 60_000);

  it("locks, and opens again only with the right passphrase", async () => {
    const service = fakeService();
    const deps: Deps = { api: service.api, devices: memoryDeviceStore() };
    await created(deps);
    lockWallet();
    expect(isUnlocked(UID, service.wallet!.walletId)).toBe(false);
    expect((await loadWalletState(deps, UID)).kind).toBe("locked");

    await expect(unlockWallet(deps, UID, "not the passphrase at all")).rejects.toBeInstanceOf(
      OpenError
    );
    expect(isUnlocked(UID, service.wallet!.walletId)).toBe(false);
    await unlockWallet(deps, UID, PASSPHRASE);
    expect(isUnlocked(UID, service.wallet!.walletId)).toBe(true);
  }, 60_000);

  it("registers a new browser with the recovery secret, and opens the wallet", async () => {
    const service = fakeService();
    const first: Deps = { api: service.api, devices: memoryDeviceStore() };
    const secret = await created(first);
    lockWallet();

    const fresh: Deps = { api: service.api, devices: memoryDeviceStore() };
    expect(await loadWalletState(fresh, UID)).toMatchObject({
      kind: "locked",
      deviceEnrolled: false,
    });
    // Typed any way a person might: lower case, spaces instead of dashes.
    await recoverOnThisDevice(fresh, UID, secret.toLowerCase().replace(/-/g, " "));
    expect(service.log).toEqual(["create", "enroll"]);
    expect(await loadWalletState(fresh, UID)).toMatchObject({
      kind: "unlocked",
      deviceEnrolled: true,
    });
    expect(service.wallet?.devices).toHaveLength(2);
  }, 60_000);

  it("rejects a mistyped, wrong or malformed recovery secret without registering anything", async () => {
    const service = fakeService();
    const deps: Deps = { api: service.api, devices: memoryDeviceStore() };
    const secret = await created(deps);
    lockWallet();
    const fresh: Deps = { api: service.api, devices: memoryDeviceStore() };

    await expect(recoverOnThisDevice(fresh, UID, "not a secret")).rejects.toBeInstanceOf(
      RecoverySecretFormatError
    );
    // One character wrong: caught by the checksum, so the person is told to fix a typo.
    const chars = secret.split("");
    const at = chars.findIndex((c) => c !== "-");
    chars[at] = chars[at] === "0" ? "1" : "0";
    await expect(recoverOnThisDevice(fresh, UID, chars.join(""))).rejects.toBeInstanceOf(
      RecoverySecretFormatError
    );
    // A well-formed secret that belongs to nobody here.
    await expect(
      recoverOnThisDevice(fresh, UID, encodeRecoverySecret(generateRecoverySecret()))
    ).rejects.toBeInstanceOf(OpenError);
    expect(service.log).toEqual(["create"]);
    expect(await fresh.devices.get(UID)).toBeNull();
  }, 60_000);

  it("does not trust a package the service returns that fails validation", async () => {
    const service = fakeService();
    const deps: Deps = { api: service.api, devices: memoryDeviceStore() };
    await created(deps);
    lockWallet();
    const tampered = {
      ...service.api,
      get: async () => {
        const w = structuredClone(service.wallet!);
        (w.package as WalletPackage).walletId = "someone-elses-wallet";
        return w;
      },
    };
    await expect(unlockWallet({ ...deps, api: tampered }, UID, PASSPHRASE)).rejects.toThrow();
  }, 60_000);

  it("reports the addresses from the validated package", async () => {
    const service = fakeService();
    const deps: Deps = { api: service.api, devices: memoryDeviceStore() };
    await created(deps);
    const list = addressesOf(service.wallet!);
    expect(list.map((a) => a.family).sort()).toEqual(["evm", "solana"]);
    expect(list.find((a) => a.family === "evm")!.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
  }, 60_000);
});
