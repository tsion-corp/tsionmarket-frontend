import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The wallet kit: who is signed in, and the Decane wallet itself.
const kit = vi.hoisted(() => ({
  wallet: {} as Record<string, unknown>,
  token: "" as string | null,
}));
vi.mock("decane-connect-kit", () => ({
  useSocialWallet: () => kit.wallet,
  useSocialAuth: () => kit.wallet,
}));

const FAKE_PKG = {
  walletId: "w1",
  accounts: [
    { family: "evm", canonicalAddress: "0xCustomEvm" },
    { family: "solana", canonicalAddress: "CustomSol" },
  ],
};
const bootstrap = vi.hoisted(() => ({ fail: false, calls: 0, uid: "user-1" }));

// The self-custody signer, faked at the module the hook loads on demand. Registered afresh
// on every load, so it shares the session store of the very hook modules under test.
function fakeAppSigner() {
  vi.doMock("@/lib/signer/app-signer", async () => {
    const session = await import("@/lib/signer/session");
    const unlock = await import("@/lib/wallet-core/unlock-state");
    return {
      createAppCustomSigner: (uid: string, pkg: typeof FAKE_PKG) => ({
        kind: "custom",
        isConnected: true,
        get isUnlocked() {
          return unlock.peekUnlocked(uid, pkg.walletId);
        },
        addresses: {
          evm: pkg.accounts[0]!.canonicalAddress,
          solana: pkg.accounts[1]!.canonicalAddress,
        },
      }),
      bootstrapCustomWalletSession: async (uid: string) => {
        bootstrap.calls += 1;
        if (bootstrap.fail) throw new Error("service down");
        session.setCustomWalletSession({
          uid: bootstrap.uid === "same" ? uid : bootstrap.uid,
          pkg: FAKE_PKG as never,
        });
      },
    };
  });
}

const tokenFor = (uid: string) => `h.${btoa(JSON.stringify({ uid }))}.s`;
const DECANE_WALLET = () => ({
  addresses: { evm: "0xDecane", solana: "DecaneSol" },
  getAccessToken: () => kit.token,
  isUnlocked: true,
  isConnected: true,
});

async function load(flag: boolean) {
  vi.resetModules();
  vi.unstubAllEnvs();
  fakeAppSigner();
  vi.stubEnv("NEXT_PUBLIC_WALLET_SWITCH_ENABLED", flag ? "true" : "false");
  const [signer, custom, pref, session, unlock, types] = await Promise.all([
    import("./use-wallet-signer"),
    import("./use-custom-wallet"),
    import("@/lib/signer/preference"),
    import("@/lib/signer/session"),
    import("@/lib/wallet-core/unlock-state"),
    import("@/lib/signer/types"),
  ]);
  return { ...signer, ...custom, ...pref, ...session, ...unlock, ...types };
}

beforeEach(() => {
  window.localStorage.clear();
  kit.wallet = DECANE_WALLET();
  kit.token = tokenFor("user-1");
  bootstrap.fail = false;
  bootstrap.calls = 0;
  bootstrap.uid = "same";
});
afterEach(() => vi.unstubAllEnvs());

describe("the signer with the switch not built in (the default)", () => {
  it("is the Decane wallet itself, untouched, and loads no wallet code", async () => {
    const m = await load(false);
    m.setActiveWalletKind("user-1", "custom"); // even a stored choice changes nothing
    const { result } = renderHook(() => m.useWalletSigner());
    expect(result.current).toBe(kit.wallet);
    const custom = renderHook(() => m.useCustomWallet());
    expect(custom.result.current).toMatchObject({ kind: "decane", signer: null, status: "off" });
    expect(bootstrap.calls).toBe(0);
  });
});

describe("the signer with the switch built in", () => {
  it("stays Decane until the account chooses the new wallet", async () => {
    const m = await load(true);
    const { result } = renderHook(() => m.useWalletSigner());
    expect(result.current).toBe(kit.wallet);
    expect(bootstrap.calls).toBe(0);
  });

  it("never hands back Decane once the new wallet is the one in use: pending, then locked, then ready", async () => {
    const m = await load(true);
    m.setActiveWalletKind("user-1", "custom");
    const seen: unknown[] = [];
    const { result } = renderHook(() => {
      const signer = m.useWalletSigner();
      const custom = m.useCustomWallet();
      seen.push(signer);
      return { signer, custom };
    });

    // Not loaded yet: it signs nothing and shows no address.
    expect(result.current.signer.kind).toBe("custom");
    expect(result.current.signer.isConnected).toBe(false);
    expect(result.current.signer.addresses).toBeNull();
    expect(result.current.custom.status).toBe("loading");
    await expect(result.current.signer.signMessage("evm:1", "x")).rejects.toBeInstanceOf(
      m.WalletNotReadyError
    );
    await expect(
      result.current.signer.sendTransaction({
        chain: "evm:8453",
        to: "0x1111111111111111111111111111111111111111",
      })
    ).rejects.toBeInstanceOf(m.WalletNotReadyError);

    // Loaded: the new wallet's own addresses, locked until the person unlocks it.
    await waitFor(() => expect(result.current.custom.status).toBe("locked"));
    expect(result.current.signer.addresses).toEqual({ evm: "0xCustomEvm", solana: "CustomSol" });
    expect(result.current.custom.addresses).toEqual({ evm: "0xCustomEvm", solana: "CustomSol" });
    expect(result.current.signer.isUnlocked).toBe(false);

    act(() => m.setUnlocked("user-1", "w1", new Uint8Array(32).fill(1)));
    await waitFor(() => expect(result.current.custom.status).toBe("ready"));
    expect(result.current.signer.isUnlocked).toBe(true);

    act(() => m.clearUnlocked());
    await waitFor(() => expect(result.current.custom.status).toBe("locked"));

    // Not once, in any state, was it the Decane wallet.
    expect(seen).not.toContain(kit.wallet);
    expect(bootstrap.calls).toBeGreaterThanOrEqual(1);
  });

  it("stays pending, and never falls back, if the wallet cannot be loaded", async () => {
    const m = await load(true);
    m.setActiveWalletKind("user-1", "custom");
    bootstrap.fail = true;
    const seen: unknown[] = [];
    const { result } = renderHook(() => {
      const signer = m.useWalletSigner();
      seen.push(signer);
      return signer;
    });
    await waitFor(() => expect(bootstrap.calls).toBeGreaterThan(0));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(result.current.isConnected).toBe(false);
    expect(result.current.addresses).toBeNull();
    expect(seen).not.toContain(kit.wallet);
  });

  it("does not use another account's wallet that happens to be loaded", async () => {
    const m = await load(true);
    m.setActiveWalletKind("user-1", "custom");
    bootstrap.uid = "someone-else";
    const { result } = renderHook(() => m.useCustomWallet());
    await waitFor(() => expect(bootstrap.calls).toBeGreaterThan(0));
    expect(result.current.status).toBe("loading");
    expect(result.current.addresses).toEqual({ evm: null, solana: null });
  });

  it("follows the account's choice back to Decane, and forward again", async () => {
    const m = await load(true);
    m.setActiveWalletKind("user-1", "custom");
    const { result } = renderHook(() => m.useWalletSigner());
    await waitFor(() => expect(result.current.kind).toBe("custom"));
    await waitFor(() => expect(result.current.addresses?.evm).toBe("0xCustomEvm"));
    act(() => m.setActiveWalletKind("user-1", "decane"));
    expect(result.current).toBe(kit.wallet);
    act(() => m.setActiveWalletKind("user-1", "custom"));
    await waitFor(() => expect(result.current.kind).toBe("custom"));
  });

  it("keeps knowing whose wallet it is while the kit rotates the token", async () => {
    const m = await load(true);
    m.setActiveWalletKind("user-1", "custom");
    const { result, rerender } = renderHook(() => m.useCustomWallet());
    await waitFor(() => expect(result.current.status).toBe("locked"));
    kit.token = null; // a render with no token
    rerender();
    expect(result.current.kind).toBe("custom");
    expect(result.current.status).toBe("locked");
  });

  it("is signed out (no wallet at all) without a session, and so is Decane", async () => {
    const m = await load(true);
    m.setActiveWalletKind("user-1", "custom");
    kit.wallet = { ...DECANE_WALLET(), addresses: null };
    const { result } = renderHook(() => m.useCustomWallet());
    expect(result.current.kind).toBe("decane"); // no account, so no choice applies
  });
});
