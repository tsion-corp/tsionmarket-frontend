import { act, renderHook, waitFor } from "@testing-library/react";
import { focusManager, QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { createQueryClient } from "@/lib/query-client";
import { isPersistedKey } from "@/lib/query-persist";
import { balanceBody, emptyBalanceBody } from "@/lib/balance/fixture";
import type { UserBalance } from "@/lib/balance/types";

const apiFetch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ apiFetch }));

const session = vi.hoisted(() => ({
  ready: true,
  authenticated: true,
  userId: "did:privy:alice" as string | null,
  evmAddress: null as string | null,
  solanaAddress: null as string | null,
  profile: { name: "u", email: "", avatarSeed: "u" },
  logout: async () => {},
}));
vi.mock("@/hooks/use-auth-session", () => ({ useAuthSession: () => session }));

import { userBalanceKey, useUserBalance } from "@/hooks/use-user-balance";

const ALICE = "did:privy:alice";
const BOB = "did:privy:bob";

// The real parser, the real query, the real route constant — only the fetch
// boundary and Privy are stubbed. A test that mocked the parser would prove
// the mock works.
function answer(data: unknown, status = 200) {
  return new Response(JSON.stringify({ success: true, data }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function refusal(code: string, status: number) {
  return new Response(JSON.stringify({ success: false, error: { code, message: "no" } }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const requestedUrls = () => apiFetch.mock.calls.map((call) => String(call[0]));

describe("useUserBalance", () => {
  let client: QueryClient;
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );

  beforeEach(() => {
    // The app's own client, not a bare one: the cadence tests below are about
    // what this hook overrides (staleTime, refetchOnWindowFocus) and what it
    // leaves alone, and neither means anything against React Query's stock
    // defaults. Only retries are switched off, so a failure case does not sit
    // through the app's backoff.
    client = createQueryClient();
    client.setDefaultOptions({ queries: { ...client.getDefaultOptions().queries, retry: false } });
    apiFetch.mockReset();
    session.ready = true;
    session.authenticated = true;
    session.userId = ALICE;
  });

  afterEach(() => {
    client.clear();
    vi.useRealTimers();
    focusManager.setFocused(undefined);
  });

  it("reads the balance path for the signed-in DID, authenticated", async () => {
    apiFetch.mockResolvedValue(answer(balanceBody()));
    const { result } = renderHook(() => useUserBalance(), { wrapper });

    await waitFor(() => expect(result.current.balance).not.toBeNull());
    expect(requestedUrls()[0]).toBe(
      `/api/user-management/users/${encodeURIComponent(ALICE)}/balance`
    );
    // requireAuth, never anonymous: the gateway scopes this to the token's sub.
    expect(apiFetch.mock.calls[0][2]).toEqual({ requireAuth: true });
  });

  it("hands back base-unit strings, not floats", async () => {
    apiFetch.mockResolvedValue(answer(balanceBody()));
    const { result } = renderHook(() => useUserBalance(), { wrapper });

    await waitFor(() => expect(result.current.balance).not.toBeNull());
    const balance = result.current.balance as UserBalance;
    const wallet = balance.wallets[0];
    expect(wallet.chain).toBe("0x2105");
    expect(wallet.native.amount).toEqual({ baseUnits: "504709067444182", decimals: 18 });
    expect(wallet.tokens[0].amount).toEqual({ baseUnits: "128718", decimals: 6 });
    // The endpoint prices nothing, and the hook does not invent a price.
    expect(balance).not.toHaveProperty("totalUsdValue");
    // No dollar figure reaches the domain at all: the service prices nothing
    // today, and the app's own price source is elsewhere.
    expect(wallet.native).not.toHaveProperty("usdValue");
    expect(wallet.tokens[0]).not.toHaveProperty("usdValue");
  });

  it("reports an account with no linked wallets as an empty balance, not an error", async () => {
    apiFetch.mockResolvedValue(answer(emptyBalanceBody()));
    const { result } = renderHook(() => useUserBalance(), { wrapper });

    await waitFor(() => expect(result.current.balance).not.toBeNull());
    expect((result.current.balance as UserBalance).wallets).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it("surfaces a body that does not match the contract instead of showing a zero balance", async () => {
    apiFetch.mockResolvedValue(
      answer({ ...(balanceBody() as object), wallets: [{ chain: "0x2105" }] })
    );
    const { result } = renderHook(() => useUserBalance(), { wrapper });

    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(result.current.balance).toBeNull();
  });

  it("surfaces a refused request", async () => {
    apiFetch.mockResolvedValue(refusal("UNAUTHORIZED", 401));
    const { result } = renderHook(() => useUserBalance(), { wrapper });

    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(result.current.balance).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it("asks for nothing while there is no signed-in account", async () => {
    session.userId = null;
    session.authenticated = false;
    const { result } = renderHook(() => useUserBalance(), { wrapper });

    await act(async () => {});
    expect(apiFetch).not.toHaveBeenCalled();
    expect(result.current.balance).toBeNull();
  });

  it("drops the previous account's balance when the signed-in account changes", async () => {
    apiFetch.mockResolvedValue(answer(balanceBody()));
    const { result, rerender } = renderHook(() => useUserBalance(), { wrapper });
    await waitFor(() => expect(result.current.balance).not.toBeNull());
    expect(client.getQueryData(userBalanceKey(ALICE))).toBeTruthy();

    session.userId = BOB;
    rerender();

    // Not merely unused: gone. Another account's holdings have no business
    // staying in this tab's cache, and SessionCacheGuard only fires on a full
    // sign-out, which a switch is not.
    await waitFor(() => expect(client.getQueryData(userBalanceKey(ALICE))).toBeUndefined());
  });

  it("drops the balance on sign-out", async () => {
    apiFetch.mockResolvedValue(answer(balanceBody()));
    const { result, rerender } = renderHook(() => useUserBalance(), { wrapper });
    await waitFor(() => expect(result.current.balance).not.toBeNull());

    session.userId = null;
    session.authenticated = false;
    rerender();

    await waitFor(() => expect(client.getQueryData(userBalanceKey(ALICE))).toBeUndefined());
    expect(result.current.balance).toBeNull();
  });

  it("is never written to the persisted cache snapshot", () => {
    // A balance is private. PERSISTED_PREFIXES is an allowlist, so this key is
    // excluded by default — this test is what keeps it that way if someone
    // adds "user-balance" to the list without reading why it is absent.
    expect(isPersistedKey(userBalanceKey(ALICE))).toBe(false);
  });

  // A loaded balance, with the clock under the test's control so the
  // fifteen-second freshness window can actually be crossed.
  async function loadedOnFakeClock() {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    apiFetch.mockResolvedValue(answer(balanceBody()));
    const view = renderHook(() => useUserBalance(), { wrapper });
    await waitFor(() => expect(view.result.current.balance).not.toBeNull());
    expect(apiFetch).toHaveBeenCalledTimes(1);
    return view;
  }

  it("holds its value for the upstream freshness window", async () => {
    apiFetch.mockResolvedValue(answer(balanceBody()));
    const first = renderHook(() => useUserBalance(), { wrapper });
    await waitFor(() => expect(first.result.current.balance).not.toBeNull());
    expect(apiFetch).toHaveBeenCalledTimes(1);

    // generatedAt and staleAt are fifteen seconds apart; inside that window
    // the service answers from the same Redis entry, so a remount must not pay
    // for the same bytes again.
    first.unmount();
    const second = renderHook(() => useUserBalance(), { wrapper });
    await waitFor(() => expect(second.result.current.balance).not.toBeNull());
    expect(apiFetch).toHaveBeenCalledTimes(1);
  });

  it("reads again when the reader comes back to the tab", async () => {
    await loadedOnFakeClock();

    focusManager.setFocused(false);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(16_000);
    });
    act(() => focusManager.setFocused(true));

    // The app-wide default is refetchOnWindowFocus: false, so this only
    // happens because the hook opts in.
    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(2));
  });

  it("does not read again on a focus inside the freshness window", async () => {
    await loadedOnFakeClock();

    focusManager.setFocused(false);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    act(() => focusManager.setFocused(true));
    await act(async () => {});

    // Five seconds in, the service still holds the same answer. Asking again
    // would buy the same bytes twice.
    expect(apiFetch).toHaveBeenCalledTimes(1);
  });

  it("never polls", async () => {
    await loadedOnFakeClock();

    // Five minutes with the tab open and untouched: twenty freshness windows
    // and not one request. Nobody watches a balance on a timer, and a poll in
    // a tab nobody is looking at is the app's largest provider cost
    // (lib/query-client.ts).
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5 * 60_000);
    });
    expect(apiFetch).toHaveBeenCalledTimes(1);
  });

  it("reads again when asked", async () => {
    apiFetch.mockResolvedValue(answer(balanceBody()));
    const { result } = renderHook(() => useUserBalance(), { wrapper });
    await waitFor(() => expect(result.current.balance).not.toBeNull());

    act(() => result.current.refetch());
    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(2));
    // A read behind a figure already on screen is a refresh, not a load: the
    // caller shows a hint, not a skeleton over what it is already showing.
    await waitFor(() => expect(result.current.isRefreshing).toBe(false));
    expect(result.current.isLoading).toBe(false);
  });
});
