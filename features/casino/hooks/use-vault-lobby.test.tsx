import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

const socket = vi.hoisted(() => ({ connected: true }));
const reads = vi.hoisted(() => ({
  fetchChainGames: vi.fn(async () => []),
  fetchActiveGames: vi.fn(async () => []),
  fetchVaultActivities: vi.fn(async () => []),
  fetchVaultWinners: vi.fn(async () => []),
  readSettledGames: vi.fn(async () => []),
  readRecentActivity: vi.fn(async () => []),
  useInvalidateOnBlock: vi.fn(),
}));

vi.mock("@/features/casino/hooks/use-vault-socket", () => ({
  useVaultSocket: () => socket.connected,
}));
vi.mock("@/features/casino/lib/vault-api", () => ({
  fetchChainGames: reads.fetchChainGames,
  fetchActiveGames: reads.fetchActiveGames,
  fetchVaultActivities: reads.fetchVaultActivities,
  fetchVaultWinners: reads.fetchVaultWinners,
}));
vi.mock("@/features/casino/hooks/use-vault-actions", () => ({
  readSettledGames: reads.readSettledGames,
  readRecentActivity: reads.readRecentActivity,
}));
vi.mock("@/hooks/use-base-block", () => ({ useInvalidateOnBlock: reads.useInvalidateOnBlock }));
vi.mock("@/hooks/use-prices", () => ({ usePrices: () => ({ ETH: 4000 }) }));

import { useVaultLobby } from "@/features/casino/hooks/use-vault-lobby";
import { useVaultFeeds } from "@/features/casino/hooks/use-vault-feeds";

// What the idle lobby costs, pinned. The socket's activeGames frame every
// 10 s is the live source; the chain is read once a minute to reconcile
// while the socket is up and every 8 s when it is down. Nothing the lobby
// does not render is read (ADR-2026-09-09-last-man-lobby-reads).
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

  it("reads the chain once a minute while the socket is up, and never the activity feed", async () => {
    renderHook(() => useVaultLobby(), { wrapper });
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(reads.fetchChainGames).toHaveBeenCalledTimes(1);

    await act(() => vi.advanceTimersByTimeAsync(59_000));
    expect(reads.fetchChainGames).toHaveBeenCalledTimes(1);
    await act(() => vi.advanceTimersByTimeAsync(2_000));
    expect(reads.fetchChainGames).toHaveBeenCalledTimes(2);

    expect(reads.readRecentActivity).not.toHaveBeenCalled();
    expect(reads.fetchVaultActivities).not.toHaveBeenCalled();
    expect(reads.readSettledGames).not.toHaveBeenCalled();
    expect(reads.fetchVaultWinners).not.toHaveBeenCalled();
    expect(reads.useInvalidateOnBlock).not.toHaveBeenCalled();
  });

  it("polls the chain every 8 s while the socket is down", async () => {
    socket.connected = false;
    renderHook(() => useVaultLobby(), { wrapper });
    await act(() => vi.advanceTimersByTimeAsync(0));
    await act(() => vi.advanceTimersByTimeAsync(24_500));
    expect(reads.fetchChainGames).toHaveBeenCalledTimes(4);
    expect(reads.readRecentActivity).not.toHaveBeenCalled();
  });

  it("prices the socket's chain rows into the lobby list", async () => {
    const { result } = renderHook(() => useVaultLobby(), { wrapper });
    await act(() => vi.advanceTimersByTimeAsync(0));
    act(() => {
      client.setQueryData(
        ["vault", "chain", "games"],
        [
          {
            gameId: 416,
            starter: "0xa",
            king: "0xa",
            potWei: 200683125358721n,
            minWagerWei: 200683125358721n,
            endTime: Math.floor(Date.now() / 1000) + 50,
          },
        ]
      );
    });
    await vi.waitFor(() => expect(result.current.games.map((g) => g.gameId)).toEqual([416]));
    expect(result.current.games[0].pot.usdValue).toBeCloseTo(0.8, 1);
  });
});

describe("useVaultFeeds on the lobby", () => {
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
    expect(reads.readSettledGames).not.toHaveBeenCalled();

    rerender({ open: true });
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(reads.fetchVaultWinners).toHaveBeenCalledTimes(1);
    expect(reads.readSettledGames).toHaveBeenCalledTimes(1);

    await act(() => vi.advanceTimersByTimeAsync(120_000));
    expect(reads.readSettledGames).toHaveBeenCalledTimes(1);
  });

  it("keeps the game page's activity feed, polled only while the socket is down", async () => {
    renderHook(() => useVaultFeeds(false, 416), { wrapper });
    await act(() => vi.advanceTimersByTimeAsync(0));
    await act(() => vi.advanceTimersByTimeAsync(24_500));
    expect(reads.readRecentActivity).toHaveBeenCalledTimes(3);
  });
});
