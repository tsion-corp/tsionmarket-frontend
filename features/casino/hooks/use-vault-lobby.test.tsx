import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

const socket = vi.hoisted(() => ({ connected: true }));
const reads = vi.hoisted(() => ({
  fetchActiveGames: vi.fn(async () => []),
  fetchVaultActivities: vi.fn(async () => []),
  fetchVaultWinners: vi.fn(async () => []),
  rpc: vi.fn(),
}));

vi.mock("@/features/casino/hooks/use-vault-socket", () => ({
  useVaultSocket: () => socket.connected,
}));
vi.mock("@/features/casino/lib/vault-api", () => ({
  fetchActiveGames: reads.fetchActiveGames,
  fetchVaultActivities: reads.fetchVaultActivities,
  fetchVaultWinners: reads.fetchVaultWinners,
}));
// Every contract read in the app goes through this client. The lobby and the
// feeds must never reach it (ADR-2026-09-10-last-man-backend-reads).
vi.mock("@/lib/trade/receipt", () => ({
  publicClientForChain: () => new Proxy({}, { get: () => reads.rpc }),
}));
vi.mock("@/hooks/use-prices", () => ({ usePrices: () => ({ ETH: 4000 }) }));

import { useVaultLobby } from "@/features/casino/hooks/use-vault-lobby";
import { useVaultFeeds } from "@/features/casino/hooks/use-vault-feeds";
import { VAULT_KEYS } from "@/features/casino/lib/last-standing/keys";

// What the idle lobby costs, pinned. The socket's activeGames frame every
// 10 s is the live source; REST is polled only while the socket is down, and
// the contract is never read for a list the service serves.
describe("useVaultLobby reads", () => {
  let client: QueryClient;
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );

  beforeEach(() => {
    vi.useFakeTimers();
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    for (const fn of Object.values(reads)) fn.mockClear();
    socket.connected = true;
  });
  afterEach(() => {
    vi.useRealTimers();
    client.clear();
  });

  it("reads the service once while the socket is up, and never the contract or the feeds", async () => {
    renderHook(() => useVaultLobby(), { wrapper });
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(reads.fetchActiveGames).toHaveBeenCalledTimes(1);

    await act(() => vi.advanceTimersByTimeAsync(120_000));
    expect(reads.fetchActiveGames).toHaveBeenCalledTimes(1);
    expect(reads.rpc).not.toHaveBeenCalled();
    expect(reads.fetchVaultActivities).not.toHaveBeenCalled();
    expect(reads.fetchVaultWinners).not.toHaveBeenCalled();
  });

  it("polls the service every 5 s while the socket is down, and still never the contract", async () => {
    socket.connected = false;
    renderHook(() => useVaultLobby(), { wrapper });
    await act(() => vi.advanceTimersByTimeAsync(0));
    await act(() => vi.advanceTimersByTimeAsync(15_500));
    expect(reads.fetchActiveGames).toHaveBeenCalledTimes(4);
    expect(reads.rpc).not.toHaveBeenCalled();
  });

  it("prices the socket's contract-shaped rows into the lobby list", async () => {
    const { result } = renderHook(() => useVaultLobby(), { wrapper });
    await act(() => vi.advanceTimersByTimeAsync(0));
    act(() => {
      client.setQueryData(VAULT_KEYS.chainGames, [
        {
          gameId: 416,
          starter: "0xa",
          king: "0xa",
          potWei: 200683125358721n,
          minWagerWei: 200683125358721n,
          endTime: Math.floor(Date.now() / 1000) + 50,
        },
      ]);
    });
    await vi.waitFor(() => expect(result.current.games.map((g) => g.gameId)).toEqual([416]));
    expect(result.current.games[0].pot.usdValue).toBeCloseTo(0.8, 1);
  });

  it("prefers the service's row for a game the socket also describes", async () => {
    const row = {
      gameId: 416,
      starter: "0xa",
      king: "0xb",
      pot: { amount: "0.0004", tokenSymbol: "ETH", usdValue: 1.6, formattedUsd: "$1.60" },
      minWager: { amount: "0.0002", tokenSymbol: "ETH", usdValue: 0.8, formattedUsd: "$0.80" },
      endTime: Math.floor(Date.now() / 1000) + 50,
      timeRemaining: 50,
      settled: false,
      active: true,
    };
    reads.fetchActiveGames.mockResolvedValueOnce([row] as never);
    const { result } = renderHook(() => useVaultLobby(), { wrapper });
    await act(() => vi.advanceTimersByTimeAsync(0));
    act(() => {
      client.setQueryData(VAULT_KEYS.chainGames, [
        {
          gameId: 416,
          starter: "0xa",
          king: "0xa",
          potWei: 200000000000000n,
          minWagerWei: 200000000000000n,
          endTime: row.endTime,
        },
      ]);
    });
    await vi.waitFor(() => expect(result.current.games).toHaveLength(1));
    expect(result.current.games[0].king).toBe("0xb");
  });
});

describe("useVaultFeeds", () => {
  let client: QueryClient;
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );

  beforeEach(() => {
    vi.useFakeTimers();
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    for (const fn of Object.values(reads)) fn.mockClear();
  });
  afterEach(() => {
    vi.useRealTimers();
    client.clear();
  });

  it("loads winners only once the Hall of Winners opens, then keeps them", async () => {
    const { rerender } = renderHook(
      ({ open }) => useVaultFeeds(true, undefined, { activity: false, winners: open }),
      { wrapper, initialProps: { open: false } }
    );
    await act(() => vi.advanceTimersByTimeAsync(30_000));
    expect(reads.fetchVaultWinners).not.toHaveBeenCalled();

    rerender({ open: true });
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(reads.fetchVaultWinners).toHaveBeenCalledTimes(1);

    await act(() => vi.advanceTimersByTimeAsync(120_000));
    expect(reads.fetchVaultWinners).toHaveBeenCalledTimes(1);
    expect(reads.rpc).not.toHaveBeenCalled();
  });

  it("polls the game page's feeds from the service only while the socket is down", async () => {
    renderHook(() => useVaultFeeds(false, 416), { wrapper });
    await act(() => vi.advanceTimersByTimeAsync(0));
    await act(() => vi.advanceTimersByTimeAsync(30_500));
    expect(reads.fetchVaultActivities).toHaveBeenCalledTimes(3);
    expect(reads.fetchVaultWinners).toHaveBeenCalledTimes(3);
    expect(reads.rpc).not.toHaveBeenCalled();
  });

  it("scopes both feeds to the game on its page, by the gameId the service carries", async () => {
    reads.fetchVaultActivities.mockResolvedValueOnce([
      { id: "a", gameId: 416, action: "started" },
      { id: "b", gameId: 415, action: "won" },
    ] as never);
    reads.fetchVaultWinners.mockResolvedValueOnce([
      { gameId: 416, settledAt: "2026-09-10T00:00:00.000Z" },
      { gameId: 415, settledAt: "2026-09-09T00:00:00.000Z" },
    ] as never);
    const { result } = renderHook(() => useVaultFeeds(true, 416), { wrapper });
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(result.current.activities.map((a) => a.id)).toEqual(["a"]);
    expect(result.current.winners.map((w) => w.gameId)).toEqual([416]);
  });
});
