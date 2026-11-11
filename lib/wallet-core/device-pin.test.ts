import { describe, expect, it } from "vitest";
import { Argon2ParamsError, type Argon2Params } from "./argon2";
import { OpenError } from "./crypto";
import { randomBytes } from "./encoding";
import {
  FRESH_PIN_GUARD,
  MAX_PIN_FAILURES,
  isValidPin,
  pinWait,
  recordPinFailure,
  recordPinSuccess,
  unwrapDeviceSecret,
  wrapDeviceSecret,
  type PinGuardState,
} from "./device-pin";

const FAST: Argon2Params = { memoryKiB: 32_768, iterations: 2, parallelism: 1, hashLength: 32 };

describe("PIN rules", () => {
  it("accepts 6 to 12 digits and nothing else", () => {
    for (const ok of ["123456", "000000", "123456789012"]) expect(isValidPin(ok)).toBe(true);
    for (const bad of ["12345", "1234567890123", "12345a", "12 345", "", "١٢٣٤٥٦", "1234.5"]) {
      expect(isValidPin(bad)).toBe(false);
    }
  });
});

describe("the device secret wrapped by a PIN", () => {
  const wrap = async (pin = "482915") => {
    const deviceSecret = randomBytes(32);
    const stored = await wrapDeviceSecret({
      pin,
      deviceSecret,
      walletId: "w1",
      deviceId: "d1",
      params: FAST,
    });
    return { deviceSecret, stored };
  };

  it("opens with the right PIN and returns the same secret", async () => {
    const { deviceSecret, stored } = await wrap();
    expect(
      await unwrapDeviceSecret({ pin: "482915", stored, walletId: "w1", deviceId: "d1" })
    ).toEqual(deviceSecret);
  });

  it("does not open with a wrong PIN", async () => {
    const { stored } = await wrap();
    await expect(
      unwrapDeviceSecret({ pin: "111111", stored, walletId: "w1", deviceId: "d1" })
    ).rejects.toBeInstanceOf(OpenError);
    await expect(
      unwrapDeviceSecret({ pin: "abcdef", stored, walletId: "w1", deviceId: "d1" })
    ).rejects.toBeInstanceOf(OpenError);
  });

  it("only opens for the wallet and device it was made for", async () => {
    const { stored } = await wrap();
    await expect(
      unwrapDeviceSecret({ pin: "482915", stored, walletId: "w2", deviceId: "d1" })
    ).rejects.toBeInstanceOf(OpenError);
    await expect(
      unwrapDeviceSecret({ pin: "482915", stored, walletId: "w1", deviceId: "d2" })
    ).rejects.toBeInstanceOf(OpenError);
  });

  it("is stretched with Argon2id, bound to its parameters, and refuses unsafe ones", async () => {
    const { stored } = await wrap();
    expect(stored).toMatchObject({ memoryKiB: 32_768, iterations: 2, parallelism: 1 });
    await expect(
      unwrapDeviceSecret({
        pin: "482915",
        stored: { ...stored, iterations: 3 },
        walletId: "w1",
        deviceId: "d1",
      })
    ).rejects.toBeInstanceOf(OpenError);
    await expect(
      unwrapDeviceSecret({
        pin: "482915",
        stored: { ...stored, memoryKiB: 1_024 },
        walletId: "w1",
        deviceId: "d1",
      })
    ).rejects.toBeInstanceOf(Argon2ParamsError);
  });

  it("refuses to wrap with an invalid PIN", async () => {
    await expect(
      wrapDeviceSecret({
        pin: "123",
        deviceSecret: randomBytes(32),
        walletId: "w1",
        deviceId: "d1",
        params: FAST,
      })
    ).rejects.toThrow();
  });

  it("uses a fresh salt each time, so the same PIN stores differently", async () => {
    const a = (await wrap()).stored;
    const b = (await wrap()).stored;
    expect(a.salt).not.toBe(b.salt);
    expect(a.wrapped).not.toBe(b.wrapped);
  });
});

describe("limiting wrong PINs", () => {
  const fail = (state: PinGuardState, now: number) => recordPinFailure(state, now);

  it("allows a few free mistakes, then makes the person wait, doubling each time", () => {
    let state = FRESH_PIN_GUARD;
    const waits: Array<number> = [];
    for (let i = 1; i < MAX_PIN_FAILURES; i += 1) {
      const result = fail(state, 0);
      expect(result.wipe).toBe(false);
      state = result.state;
      waits.push(pinWait(state, 0));
    }
    expect(waits).toEqual([0, 0, 0, 0, 30_000, 60_000, 120_000, 240_000, 480_000]);
  });

  it("destroys the device secret on the tenth wrong PIN", () => {
    let state = FRESH_PIN_GUARD;
    let wipe = false;
    for (let i = 0; i < MAX_PIN_FAILURES; i += 1) {
      const result = fail(state, 0);
      state = result.state;
      wipe = result.wipe;
    }
    expect(wipe).toBe(true);
    expect(pinWait(state, 1e15)).toBe(Number.POSITIVE_INFINITY);
  });

  it("counts the wait from the failed attempt and lets it run out", () => {
    let state = FRESH_PIN_GUARD;
    for (let i = 0; i < 5; i += 1) state = fail(state, 1_000).state;
    expect(pinWait(state, 1_000)).toBe(30_000);
    expect(pinWait(state, 1_000 + 29_999)).toBe(1);
    expect(pinWait(state, 1_000 + 30_000)).toBe(0);
  });

  it("forgets earlier mistakes after a correct PIN", () => {
    let state = FRESH_PIN_GUARD;
    for (let i = 0; i < 6; i += 1) state = fail(state, 0).state;
    expect(recordPinSuccess()).toEqual(FRESH_PIN_GUARD);
  });
});
