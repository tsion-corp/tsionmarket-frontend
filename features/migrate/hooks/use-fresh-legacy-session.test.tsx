import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  resetFreshLegacySession,
  useFreshLegacySession,
} from "@/features/migrate/hooks/use-fresh-legacy-session";

const privy = vi.hoisted(() => ({
  state: { ready: false, authenticated: false, logout: vi.fn(async () => {}) },
}));

vi.mock("@privy-io/react-auth", () => ({ usePrivy: () => privy.state }));
const decane = vi.hoisted(() => ({
  evmAddress: "0xnew0000000000000000000000000000000000001" as string | null,
}));
vi.mock("@/hooks/use-auth-session", () => ({ useAuthSession: () => decane }));

const oauth = vi.hoisted(() => ({ returning: false }));
vi.mock("@/features/migrate/lib/oauth-return", () => ({
  get returningFromPrivyOAuth() {
    return oauth.returning;
  },
}));

beforeEach(() => {
  resetFreshLegacySession();
  oauth.returning = false;
  decane.evmAddress = "0xnew0000000000000000000000000000000000001";
  privy.state = { ready: false, authenticated: false, logout: vi.fn(async () => {}) };
});

describe("useFreshLegacySession", () => {
  it("throws away a session Privy restored on its own", async () => {
    privy.state = { ...privy.state, ready: true, authenticated: true };
    const { result } = renderHook(() => useFreshLegacySession());

    await waitFor(() => expect(result.current).toBe(true));
    expect(privy.state.logout).toHaveBeenCalledOnce();
  });

  it("has nothing to throw away when Privy restored nothing", async () => {
    privy.state = { ...privy.state, ready: true, authenticated: false };
    const { result } = renderHook(() => useFreshLegacySession());

    await waitFor(() => expect(result.current).toBe(true));
    expect(privy.state.logout).not.toHaveBeenCalled();
  });

  it("waits for ready before judging, so a session restoring late is still discarded", async () => {
    // Deciding while Privy is still restoring reads authenticated: false and
    // would wave the restored session straight through a moment later.
    const { result, rerender } = renderHook(() => useFreshLegacySession());
    expect(result.current).toBe(false);
    expect(privy.state.logout).not.toHaveBeenCalled();

    privy.state = { ...privy.state, ready: true, authenticated: true };
    rerender();

    await waitFor(() => expect(result.current).toBe(true));
    expect(privy.state.logout).toHaveBeenCalledOnce();
  });

  /*
    Seen live: one account upgraded, the person signed out of Decane and in
    as another in the same page load, and the first account's old session
    was handed to the second — its link answered LEGACY_ALREADY_LINKED. A
    different new account starts the discard over.
  */
  it("discards again when a different new account signs in on the same page", async () => {
    privy.state = { ...privy.state, ready: true, authenticated: true };
    const { result, rerender } = renderHook(() => useFreshLegacySession());
    await waitFor(() => expect(result.current).toBe(true));
    expect(privy.state.logout).toHaveBeenCalledOnce();

    decane.evmAddress = "0xother000000000000000000000000000000000002";
    rerender();
    await waitFor(() => expect(privy.state.logout).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current).toBe(true));
  });

  it("logs out once per page load however many surfaces are mounted", async () => {
    privy.state = { ...privy.state, ready: true, authenticated: true };
    const sheet = renderHook(() => useFreshLegacySession());
    const button = renderHook(() => useFreshLegacySession());

    await waitFor(() => expect(sheet.result.current).toBe(true));
    await waitFor(() => expect(button.result.current).toBe(true));
    expect(privy.state.logout).toHaveBeenCalledOnce();
  });

  it("does not log the user out again after they sign in", async () => {
    privy.state = { ...privy.state, ready: true, authenticated: false };
    const { result, rerender } = renderHook(() => useFreshLegacySession());
    await waitFor(() => expect(result.current).toBe(true));

    // The sign-in the panel asked for lands.
    privy.state = { ...privy.state, authenticated: true };
    rerender();

    await waitFor(() => expect(result.current).toBe(true));
    expect(privy.state.logout).not.toHaveBeenCalled();
  });
});

describe("when the logout itself fails", () => {
  it("stays false rather than handing out the inherited session", async () => {
    const error = new Error("network");
    privy.state = {
      ready: true,
      authenticated: true,
      logout: vi.fn(async () => {
        throw error;
      }),
    };
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { result } = renderHook(() => useFreshLegacySession());

    await waitFor(() => expect(privy.state.logout).toHaveBeenCalled());
    await waitFor(() => expect(spy).toHaveBeenCalled());
    // Never flips: a signer here would spend from the account we failed to
    // clear away.
    expect(result.current).toBe(false);
    spy.mockRestore();
  });
});

describe("returning from a Google or Twitter sign-in", () => {
  it("keeps the session the user just created", async () => {
    // The credentials are in this very URL. Logging out here would undo the
    // sign-in the user just completed, and they would never reach the sweep.
    oauth.returning = true;
    privy.state = { ...privy.state, ready: true, authenticated: true };

    const { result } = renderHook(() => useFreshLegacySession());

    await waitFor(() => expect(result.current).toBe(true));
    expect(privy.state.logout).not.toHaveBeenCalled();
  });
});
