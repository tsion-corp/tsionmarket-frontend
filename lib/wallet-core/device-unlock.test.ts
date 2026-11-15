import { describe, expect, it } from "vitest";
import { memoryUnlockStore } from "@/lib/wallet-device/store";
import type { Argon2Params } from "./argon2";
import {
  PinUnlockError,
  enableDeviceUnlock,
  hasDeviceUnlock,
  removeDeviceUnlock,
  unlockWithDevicePin,
} from "./device-unlock";
import { MAX_PIN_FAILURES } from "./device-pin";
import { randomBytes } from "./encoding";

const FAST: Argon2Params = { memoryKiB: 32_768, iterations: 2, parallelism: 1, hashLength: 32 };
const UID = "u1";
const WALLET = "wallet-1";

async function setup(pin = "482915") {
  const store = memoryUnlockStore();
  const dek = randomBytes(32);
  await enableDeviceUnlock({ store, uid: UID, walletId: WALLET, dek, pin, params: FAST });
  return { store, dek };
}
const attempt = (store: ReturnType<typeof memoryUnlockStore>, pin: string, now = () => 1_000_000) =>
  unlockWithDevicePin({ store, uid: UID, walletId: WALLET, pin, now });

describe("unlocking with a PIN on this device", () => {
  it("returns the wallet key for the right PIN, and only that", async () => {
    const { store, dek } = await setup();
    expect(await hasDeviceUnlock(store, UID, WALLET)).toBe(true);
    expect([...(await attempt(store, "482915"))]).toEqual([...dek]);
    await expect(attempt(store, "000000")).rejects.toMatchObject({ reason: "wrong" });
  });

  it("stores nothing that holds the key or the PIN in the clear", async () => {
    const { store, dek } = await setup("482915");
    const text = JSON.stringify(await store.get(UID));
    expect(text).not.toContain("482915");
    expect(text).not.toContain(Buffer.from(dek).toString("base64"));
  });

  it("refuses a PIN that is not 6 to 12 digits, when setting it", async () => {
    const store = memoryUnlockStore();
    await expect(
      enableDeviceUnlock({
        store,
        uid: UID,
        walletId: WALLET,
        dek: randomBytes(32),
        pin: "123",
        params: FAST,
      })
    ).rejects.toThrow(/6 to 12/);
    expect(await hasDeviceUnlock(store, UID, WALLET)).toBe(false);
  });

  it("counts wrong tries, waits after a few, and wipes the PIN on the tenth", async () => {
    const { store } = await setup();
    let clock = 1_000_000;
    const now = () => clock;
    // The first few misses are free and say how many tries remain.
    for (let i = 1; i <= 4; i += 1) {
      await expect(attempt(store, "111111", now)).rejects.toMatchObject({ reason: "wrong" });
    }
    // The fifth starts a wait; during it even the right PIN is refused.
    await expect(attempt(store, "111111", now)).rejects.toMatchObject({ reason: "wrong" });
    await expect(attempt(store, "482915", now)).rejects.toMatchObject({ reason: "wait" });
    for (let failures = 5; failures < MAX_PIN_FAILURES - 1; failures += 1) {
      clock += 24 * 60 * 60_000;
      await expect(attempt(store, "111111", now)).rejects.toMatchObject({ reason: "wrong" });
    }
    clock += 24 * 60 * 60_000;
    await expect(attempt(store, "111111", now)).rejects.toMatchObject({ reason: "wiped" });
    expect(await hasDeviceUnlock(store, UID, WALLET)).toBe(false);
    await expect(attempt(store, "482915", now)).rejects.toMatchObject({ reason: "none" });
  });

  it("remembers wrong tries across a reload, and a right PIN clears them", async () => {
    const { store } = await setup();
    await expect(attempt(store, "111111")).rejects.toBeInstanceOf(PinUnlockError);
    expect((await store.get(UID))?.guard.failures).toBe(1);
    await attempt(store, "482915");
    expect((await store.get(UID))?.guard.failures).toBe(0);
  });

  it("belongs to one wallet and can be removed", async () => {
    const { store } = await setup();
    await expect(
      unlockWithDevicePin({ store, uid: UID, walletId: "another", pin: "482915" })
    ).rejects.toMatchObject({ reason: "none" });
    await removeDeviceUnlock(store, UID);
    expect(await hasDeviceUnlock(store, UID, WALLET)).toBe(false);
  });
});
