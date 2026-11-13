import { afterEach, describe, expect, it } from "vitest";
import {
  IDLE_TIMEOUT_MS,
  MAX_LIFETIME_MS,
  clearUnlocked,
  getUnlockedKey,
  isUnlocked,
  peekUnlocked,
  setClockForTests,
  setUnlocked,
  subscribeUnlocked,
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

describe("following lock and unlock", () => {
  it("tells a listener when the wallet is unlocked, locked, and when it expires", async () => {
    let now = 1_000;
    setClockForTests(() => now);
    const seen: boolean[] = [];
    const unsubscribe = subscribeUnlocked(() => seen.push(isUnlocked("u", "w")));
    setUnlocked("u", "w", new Uint8Array(32).fill(7), 10_000, 60_000);
    clearUnlocked();
    setUnlocked("u", "w", new Uint8Array(32).fill(7), 10_000, 60_000);
    now += 11_000; // idle past the window
    expect(getUnlockedKey("u", "w")).toBeUndefined();
    await Promise.resolve(); // the expiry is announced after the read, not during it
    unsubscribe();
    setUnlocked("u", "w", new Uint8Array(32).fill(7));
    expect(seen).toEqual([true, false, true, false]);
    clearUnlocked();
    setClockForTests(null);
  });
});

describe("peeking at the lock", () => {
  it("shows whether it is open without keeping it open", () => {
    now = 1_000_000;
    setClockForTests(clock);
    setUnlocked("u", "w", new Uint8Array(32).fill(1), 10_000, 60_000);
    expect(peekUnlocked("u", "w")).toBe(true);
    expect(peekUnlocked("other", "w")).toBe(false);
    expect(peekUnlocked("u", "other")).toBe(false);
    // Looking does not extend the idle window: the original deadline still applies.
    now += 6_000;
    expect(peekUnlocked("u", "w")).toBe(true);
    now += 6_000; // 12s after unlock: past the 10s idle window, and nothing used it
    expect(peekUnlocked("u", "w")).toBe(false);
    clearUnlocked();
    setClockForTests(null);
  });
});
