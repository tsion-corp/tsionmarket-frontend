import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const UID = "user-1";

async function load(flag: "true" | "false" | undefined) {
  vi.resetModules();
  vi.unstubAllEnvs();
  if (flag !== undefined) vi.stubEnv("NEXT_PUBLIC_WALLET_SWITCH_ENABLED", flag);
  return import("./preference");
}

beforeEach(() => window.localStorage.clear());
afterEach(() => vi.unstubAllEnvs());

describe("which wallet the app uses", () => {
  it("is Decane unless the switch is built in AND the account chose the new wallet", async () => {
    const on = await load("true");
    expect(on.walletSwitchEnabled()).toBe(true);
    expect(on.getActiveWalletKind(UID)).toBe("decane");
    on.setActiveWalletKind(UID, "custom");
    expect(on.getActiveWalletKind(UID)).toBe("custom");
    // Another account on the same device is unaffected.
    expect(on.getActiveWalletKind("user-2")).toBe("decane");
    // And no account at all (signed out) is Decane.
    expect(on.getActiveWalletKind(null)).toBe("decane");
    on.setActiveWalletKind(UID, "decane");
    expect(on.getActiveWalletKind(UID)).toBe("decane");
  });

  it("ignores a stored choice entirely when the switch is not built in", async () => {
    const on = await load("true");
    on.setActiveWalletKind(UID, "custom");
    for (const flag of ["false", undefined, "yes", "1", ""] as const) {
      const off = await load(flag as "false" | undefined);
      expect(off.walletSwitchEnabled()).toBe(false);
      expect(off.getActiveWalletKind(UID), String(flag)).toBe("decane");
    }
  });

  it("tells listeners when the choice changes, and stops when they unsubscribe", async () => {
    const pref = await load("true");
    const listener = vi.fn();
    const unsubscribe = pref.subscribeActiveWalletKind(listener);
    pref.setActiveWalletKind(UID, "custom");
    pref.setActiveWalletKind(UID, "decane");
    expect(listener).toHaveBeenCalledTimes(2);
    window.dispatchEvent(new Event("storage")); // another tab
    expect(listener).toHaveBeenCalledTimes(3);
    unsubscribe();
    pref.setActiveWalletKind(UID, "custom");
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it("stays on Decane when storage is blocked, rather than guessing", async () => {
    const pref = await load("true");
    const real = Object.getOwnPropertyDescriptor(window, "localStorage")!;
    const blocked = {
      length: 1,
      key: () => {
        throw new Error("blocked");
      },
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    Object.defineProperty(window, "localStorage", { value: blocked, configurable: true });
    try {
      expect(pref.getActiveWalletKind(UID)).toBe("decane");
      expect(pref.getActiveWalletKindWhileIdUnknown()).toBe("decane");
      expect(() => pref.setActiveWalletKind(UID, "custom")).not.toThrow();
      expect(pref.getActiveWalletKind(UID)).toBe("decane");
    } finally {
      Object.defineProperty(window, "localStorage", real);
    }
  });

  it("treats someone whose id is not known yet as having chosen the new wallet if anyone on this device did", async () => {
    const pref = await load("true");
    expect(pref.getActiveWalletKindWhileIdUnknown()).toBe("decane");
    pref.setActiveWalletKind("user-9", "custom");
    expect(pref.getActiveWalletKindWhileIdUnknown()).toBe("custom");
    pref.setActiveWalletKind("user-9", "decane");
    expect(pref.getActiveWalletKindWhileIdUnknown()).toBe("decane");
    const off = await load("false");
    expect(off.getActiveWalletKindWhileIdUnknown()).toBe("decane");
  });
});
