import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getCustomWalletSession,
  setCustomWalletSession,
  subscribeCustomWalletSession,
} from "./session";

const pkg = (version: number, walletId = "w1") => ({ walletId, version }) as never;

afterEach(() => setCustomWalletSession(null));

describe("the self-custody wallet session", () => {
  it("holds the package for an account and tells listeners when it changes", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeCustomWalletSession(listener);
    setCustomWalletSession({ uid: "u", pkg: pkg(1) });
    expect(getCustomWalletSession()).toMatchObject({ uid: "u" });
    setCustomWalletSession(null);
    expect(getCustomWalletSession()).toBeNull();
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    setCustomWalletSession({ uid: "u", pkg: pkg(1) });
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("stays quiet when the same version of the same wallet is loaded again", () => {
    setCustomWalletSession({ uid: "u", pkg: pkg(3) });
    const listener = vi.fn();
    subscribeCustomWalletSession(listener);
    const first = getCustomWalletSession();
    setCustomWalletSession({ uid: "u", pkg: pkg(3) });
    expect(listener).not.toHaveBeenCalled();
    expect(getCustomWalletSession()).toBe(first);
  });

  it("does tell them when the version, the wallet or the account differs", () => {
    setCustomWalletSession({ uid: "u", pkg: pkg(3) });
    const listener = vi.fn();
    subscribeCustomWalletSession(listener);
    setCustomWalletSession({ uid: "u", pkg: pkg(4) });
    setCustomWalletSession({ uid: "u", pkg: pkg(4, "w2") });
    setCustomWalletSession({ uid: "other", pkg: pkg(4, "w2") });
    expect(listener).toHaveBeenCalledTimes(3);
  });
});
