import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider, onlineManager } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import { VAULT_KEYS } from "@/features/casino/lib/last-standing/keys";

// Switches the mocked transports mid-test: `connected` is the socket,
// `fetchOk` the REST fallback.
const state = vi.hoisted(() => ({ connected: true, fetchOk: true }));

vi.mock("@/features/casino/hooks/use-vault-socket", () => ({
  useVaultSocket: () => state.connected,
}));
vi.mock("@/features/casino/lib/vault-api", () => ({
  fetchGame: (gameId: number) =>
    state.fetchOk
      ? Promise.resolve({
          gameId,
          starter: "0xstarter",
          king: "0xking",
          pot: { amount: "0.001", tokenSymbol: "ETH", usdValue: 4, formattedUsd: "$4.00" },
          minWager: {
            amount: "0.0002",
            tokenSymbol: "ETH",
            usdValue: 0.8,
            formattedUsd: "$0.80",
          },
          endTime: Math.floor(Date.now() / 1000) + 120,
          timeRemaining: 120,
          settled: false,
          active: true,
        })
      : Promise.reject(new Error("fetch failed")),
}));
vi.mock("@/features/casino/hooks/use-vault-actions", () => ({
  readGame: () => Promise.resolve(null),
}));
vi.mock("@/hooks/use-prices", () => ({ usePrices: () => ({ ETH: 4000 }) }));
vi.mock("@/hooks/use-base-block", () => ({ useInvalidateOnBlock: () => {} }));

import { useVaultGame } from "@/features/casino/hooks/use-vault-game";

function setOnline(value: boolean) {
  Object.defineProperty(window.navigator, "onLine", { configurable: true, value });
  window.dispatchEvent(new Event(value ? "online" : "offline"));
}

function harness() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
  return { client, wrapper };
}

describe("useVaultGame connection health", () => {
  beforeEach(() => {
    state.connected = true;
    state.fetchOk = true;
    // react-query's singleton onlineManager also hears the offline events a
    // previous test dispatched and would leave every later query paused, so
    // it is reset explicitly along with the browser flag.
    setOnline(true);
    onlineManager.setOnline(true);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("is not degraded while the socket is up", async () => {
    const { wrapper } = harness();
    const { result } = renderHook(() => useVaultGame(7), { wrapper });
    await waitFor(() => expect(result.current.game).not.toBeNull());
    expect(result.current.degraded).toBe(false);
  });

  it("is not degraded when only the socket is down: the REST poll still delivers", async () => {
    state.connected = false;
    const { wrapper } = harness();
    const { result } = renderHook(() => useVaultGame(7), { wrapper });
    await waitFor(() => expect(result.current.game).not.toBeNull());
    expect(result.current.degraded).toBe(false);
  });

  it("degrades when the socket is down AND the fallback fetch fails", async () => {
    state.connected = false;
    state.fetchOk = false;
    const { wrapper } = harness();
    const { result } = renderHook(() => useVaultGame(7), { wrapper });
    await waitFor(() => expect(result.current.degraded).toBe(true));
  });

  it("degrades the moment the browser reports offline", async () => {
    const { wrapper } = harness();
    const { result } = renderHook(() => useVaultGame(7), { wrapper });
    await waitFor(() => expect(result.current.game).not.toBeNull());
    act(() => setOnline(false));
    expect(result.current.degraded).toBe(true);
  });

  it("resyncs by itself when the network returns", async () => {
    const { client, wrapper } = harness();
    const spy = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useVaultGame(7), { wrapper });
    await waitFor(() => expect(result.current.game).not.toBeNull());
    act(() => setOnline(false));
    expect(result.current.degraded).toBe(true);
    spy.mockClear();
    act(() => setOnline(true));
    expect(spy).toHaveBeenCalledWith({ queryKey: VAULT_KEYS.game(7) });
    expect(result.current.degraded).toBe(false);
  });
});
