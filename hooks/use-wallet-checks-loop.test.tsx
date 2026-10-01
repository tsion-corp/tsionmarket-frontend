import { useCallback, useState } from "react";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The kit's useSocialWallet, as it really behaves: a NEW object every render,
// and every method sets the hook's own `loading` state while it runs. An
// effect that lists the whole wallet object as a dependency therefore re-runs
// on every call it makes, and the mobile account sheet froze in exactly that
// loop: hasPasskey -> setLoading -> re-render -> new wallet -> hasPasskey ...
const calls = { hasPasskey: 0, canUnlockWithPassword: 0 };

function useFakeSocialWallet() {
  const [loading, setLoading] = useState(false);
  const run = async <T,>(value: T) => {
    setLoading(true);
    await Promise.resolve();
    setLoading(false);
    return value;
  };
  const hasPasskey = useCallback(() => {
    calls.hasPasskey += 1;
    return run(false);
  }, []);
  const canUnlockWithPassword = useCallback(() => {
    calls.canUnlockWithPassword += 1;
    return run(false);
  }, []);
  const addPasskey = useCallback(async () => {}, []);
  const setUnlockPassword = useCallback(async () => {}, []);
  return {
    isConnected: true,
    loading,
    hasPasskey,
    canUnlockWithPassword,
    addPasskey,
    setUnlockPassword,
    disconnect: async () => {},
    openModal: () => {},
  };
}

vi.mock("decane-connect-kit", () => ({ useSocialWallet: () => useFakeSocialWallet() }));
vi.mock("@/lib/decane-recovery", () => ({ promptUnlockPassword: vi.fn() }));

import { useDevicePasskey } from "@/hooks/use-device-passkey";
import { useUnlockPassword } from "@/hooks/use-unlock-password";

async function settle() {
  for (let i = 0; i < 40; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 1));
    });
  }
}

describe("wallet checks on the account sheet", () => {
  beforeEach(() => {
    calls.hasPasskey = 0;
    calls.canUnlockWithPassword = 0;
    vi.stubGlobal("PublicKeyCredential", {
      isUserVerifyingPlatformAuthenticatorAvailable: () => Promise.resolve(true),
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("asks the wallet whether it has a passkey once, not on every render", async () => {
    const { result } = renderHook(() => useDevicePasskey());
    await settle();
    expect(result.current.canAdd).toBe(true);
    expect(calls.hasPasskey).toBe(1);
  });

  it("asks about the unlock password once, not on every render", async () => {
    const { result } = renderHook(() => useUnlockPassword());
    await settle();
    expect(result.current.canSet).toBe(true);
    expect(calls.hasPasskey).toBe(1);
    expect(calls.canUnlockWithPassword).toBe(1);
  });
});
