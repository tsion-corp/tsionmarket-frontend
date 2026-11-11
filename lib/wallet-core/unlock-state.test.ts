import { afterEach, describe, expect, it } from "vitest";
import {
  IDLE_TIMEOUT_MS,
  MAX_LIFETIME_MS,
  clearUnlocked,
  getUnlockedKey,
  isUnlocked,
  setClockForTests,
  setUnlocked,
} from "./unlock-state";

let now = 1_000_000;
const clock = () => now;

afterEach(() => {
  clearUnlocked();
  setClockForTests(null);
});

const start = (dek = Uint8Array.of(1, 2, 3, 4)) => {
  now = 1_000_000;
  setClockForTests(clock);
  setUnlocked("user-1", "wallet-1", dek);
};

describe("unlock state", () => {
  it("holds the key for the right user and wallet only", () => {
    start();
    expect(getUnlockedKey("user-1", "wallet-1")).toEqual(Uint8Array.of(1, 2, 3, 4));
    expect(getUnlockedKey("user-2", "wallet-1")).toBeUndefined();
    expect(getUnlockedKey("user-1", "wallet-2")).toBeUndefined();
    expect(isUnlocked("user-1", "wallet-1")).toBe(true);
  });

  it("expires after inactivity", () => {
    start();
    now += IDLE_TIMEOUT_MS + 1;
    expect(getUnlockedKey("user-1", "wallet-1")).toBeUndefined();
    expect(isUnlocked("user-1", "wallet-1")).toBe(false);
  });

  it("is extended by use, but never past the absolute lifetime", () => {
    start();
    // Used every 20 minutes (always inside the 30 minute idle window), it stays
    // unlocked for as long as it keeps being used...
    const step = 20 * 60_000;
    while (now + step < 1_000_000 + MAX_LIFETIME_MS - 60_000) {
      now += step;
      expect(getUnlockedKey("user-1", "wallet-1")).toBeDefined();
    }
    // ...right up to the 24 hour cap, and not a moment beyond it, however
    // recently it was used.
    now = 1_000_000 + MAX_LIFETIME_MS - 60_000;
    expect(getUnlockedKey("user-1", "wallet-1")).toBeDefined();
    now = 1_000_000 + MAX_LIFETIME_MS + 1;
    expect(getUnlockedKey("user-1", "wallet-1")).toBeUndefined();
  });

  it("zeroes the key when it is cleared or expires", () => {
    start();
    const key = getUnlockedKey("user-1", "wallet-1")!;
    clearUnlocked();
    expect(key).toEqual(new Uint8Array(4));
    expect(getUnlockedKey("user-1", "wallet-1")).toBeUndefined();

    start();
    const second = getUnlockedKey("user-1", "wallet-1")!;
    now += IDLE_TIMEOUT_MS + 1;
    expect(getUnlockedKey("user-1", "wallet-1")).toBeUndefined();
    expect(second).toEqual(new Uint8Array(4));
  });

  it("does not keep the caller's buffer, so wiping it cannot lock the wallet or leak the key", () => {
    const dek = Uint8Array.of(9, 9, 9, 9);
    now = 1_000_000;
    setClockForTests(clock);
    setUnlocked("user-1", "wallet-1", dek);
    dek.fill(0);
    expect(getUnlockedKey("user-1", "wallet-1")).toEqual(Uint8Array.of(9, 9, 9, 9));
  });

  it("clears the previous session when a different one starts", () => {
    start(Uint8Array.of(1, 1, 1, 1));
    const first = getUnlockedKey("user-1", "wallet-1")!;
    setUnlocked("user-2", "wallet-9", Uint8Array.of(2, 2, 2, 2));
    expect(first).toEqual(new Uint8Array(4));
    expect(getUnlockedKey("user-1", "wallet-1")).toBeUndefined();
    expect(getUnlockedKey("user-2", "wallet-9")).toEqual(Uint8Array.of(2, 2, 2, 2));
  });
});
