// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider, onlineManager } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import { VAULT_KEYS } from "@/features/casino/lib/last-standing/keys";
import { apiError } from "@/lib/api/envelope";

// Switches the mocked transports mid-test: `connected` is the socket,
// `service` what the REST fallback answers.
const state = vi.hoisted(() => ({
  connected: true,
  service: "ok" as "ok" | "settled" | "missing" | "down" | "unstarted" | "legacy",
  chain: vi.fn(),
  rpc: vi.fn(),
  followed: null as number | null,
  unfollow: vi.fn(),
}));

// What the service answers for a game whose start transaction the chain has
// not caught up with: the row exists, the round has not begun. Seen on a real
// create, which is how a just-opened game rendered an empty pot and a dead
// clock.
function unstartedRow(gameId: number) {
  return {
    gameId,
    starter: "0xstarter",
    king: "0x0000000000000000000000000000000000000000",
    pot: { amount: "0", raw: "0", tokenSymbol: "USDC", usdValue: 0, formattedUsd: "\u2014" },
    minWager: { amount: "0", raw: "0", tokenSymbol: "USDC", usdValue: 0, formattedUsd: "\u2014" },
    endTime: 0,
    timeRemaining: 0,
    settled: false,
    active: false,
  };
}

// What the service answers for an id the CURRENT contract has not reached yet.
// Game ids repeat across contract generations, so the retired v4 contract's
// long-settled ETH game still shows through until v5's own row is indexed.
function legacyRow(gameId: number) {
  return {
    gameId,
    starter: "0xlegacy",
    king: "0xlegacy",
    pot: {
      amount: "0.0004",
      raw: "400000000000000",
      tokenSymbol: "ETH",
      usdValue: 1,
      formattedUsd: "$1.07",
    },
    minWager: {
      amount: "0.0002",
      raw: "200000000000000",
      tokenSymbol: "ETH",
      usdValue: 0.5,
      formattedUsd: "$0.54",
    },
    endTime: 1787340713,
    timeRemaining: 0,
    settled: true,
    active: false,
  };
}

function row(gameId: number, settled = false) {
  return {
    gameId,
    starter: "0xstarter",
    king: "0xking",
    pot: { amount: "0.001", tokenSymbol: "ETH", usdValue: 4, formattedUsd: "$4.00" },
    minWager: { amount: "0.0002", tokenSymbol: "ETH", usdValue: 0.8, formattedUsd: "$0.80" },
    endTime: Math.floor(Date.now() / 1000) + (settled ? -120 : 120),
    timeRemaining: settled ? 0 : 120,
    settled,
    active: !settled,
  };
}

vi.mock("@/features/casino/hooks/use-vault-socket", () => ({
  useVaultSocket: () => state.connected,
}));
vi.mock("@/features/casino/lib/vault-api", async () => {
  const actual = await vi.importActual<typeof import("@/features/casino/lib/vault-api")>(
    "@/features/casino/lib/vault-api"
  );
  return {
    isVaultNotFound: actual.isVaultNotFound,
    fetchGame: (gameId: number) => {
      if (state.service === "ok") return Promise.resolve(row(gameId));
      if (state.service === "settled") return Promise.resolve(row(gameId, true));
      if (state.service === "unstarted") return Promise.resolve(unstartedRow(gameId));
      if (state.service === "legacy") return Promise.resolve(legacyRow(gameId));
      if (state.service === "missing")
        return Promise.reject(apiError("NOT_FOUND", "Game not found", 404));
      return Promise.reject(new Error("fetch failed"));
    },
  };
});
vi.mock("@/features/casino/hooks/use-vault-actions", () => ({
  readGame: (id: number) => state.chain(id),
}));
vi.mock("@/lib/trade/receipt", () => ({
  publicClientForChain: () => new Proxy({}, { get: () => state.rpc }),
}));
vi.mock("@/features/casino/lib/last-standing/followed-game", () => ({
  followedGameSnapshot: () => state.followed,
  unfollowGame: state.unfollow,
}));
vi.mock("@/hooks/use-prices", () => ({ usePrices: () => ({ ETH: 4000 }) }));

import { useVaultGame } from "@/features/casino/hooks/use-vault-game";

function setOnline(value: boolean) {
  Object.defineProperty(window.navigator, "onLine", { configurable: true, value });
  window.dispatchEvent(new Event(value ? "online" : "offline"));
}

// `keep` holds cache entries nothing observes, for the tests that read what a
// seed wrote; the health tests want entries gone the moment a hook unmounts.
function harness(keep = false) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: keep ? 60_000 : 0 } },
  });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
  return { client, wrapper };
}

beforeEach(() => {
  state.connected = true;
  state.service = "ok";
  state.followed = null;
  state.chain.mockReset();
  state.chain.mockResolvedValue(null);
  state.rpc.mockReset();
  state.unfollow.mockClear();
  // react-query's singleton onlineManager also hears the offline events a
  // previous test dispatched and would leave every later query paused, so
  // it is reset explicitly along with the browser flag.
  setOnline(true);
  onlineManager.setOnline(true);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("useVaultGame reads", () => {
  it("reads the service and nothing else while the socket is up", async () => {
    const { wrapper } = harness();
    const { result } = renderHook(() => useVaultGame(7), { wrapper });
    await waitFor(() => expect(result.current.game).not.toBeNull());
    expect(state.chain).not.toHaveBeenCalled();
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it("treats the service's 404 as final: no contract read, no retry", async () => {
    state.service = "missing";
    const { wrapper } = harness();
    const { result } = renderHook(() => useVaultGame(7), { wrapper });
    await waitFor(() => expect(result.current.error).toBe(true));
    expect(state.chain).not.toHaveBeenCalled();
  });

  // There is no contract read of our own behind the service any more. GET
  // /games/:id falls through to the chain service-side when the index lags —
  // verified on 2026-09-15, when it answered for a game the index did not hold
  // — so an unreachable service is a retry, not a second decode in the browser.
  // A v4-shaped decode of a v5 game does not fail, it reports a pot of 7.49e29.
  it("retries rather than reading the contract when the service cannot be reached", async () => {
    state.service = "down";
    const { wrapper } = harness();
    const { result } = renderHook(() => useVaultGame(7), { wrapper });
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.game).toBeNull();
    expect(state.chain).not.toHaveBeenCalled();
  });
});

describe("useVaultGame confirmGame", () => {
  it("retries the service for a fresh game before touching the contract", async () => {
    vi.useFakeTimers();
    let calls = 0;
    state.service = "missing";
    const { client, wrapper } = harness(true);
    const { result } = renderHook(() => useVaultGame(null), { wrapper });
    // The first two asks find no row; the third does.
    const original = state.service;
    const timer = setInterval(() => {
      calls += 1;
      if (calls >= 2) state.service = "ok";
    }, 1_000);
    const confirmed = result.current.confirmGame(9);
    await vi.advanceTimersByTimeAsync(3_000);
    clearInterval(timer);
    expect(await confirmed).toBe(true);
    expect(state.chain).not.toHaveBeenCalled();
    expect(client.getQueryData(VAULT_KEYS.game(9))).toMatchObject({ gameId: 9 });
    expect(client.getQueryData(VAULT_KEYS.games)).toEqual([expect.objectContaining({ gameId: 9 })]);
    state.service = original;
  });

  // Same reason as above: a game the service cannot confirm is not confirmed
  // here either, so the caller waits rather than being handed a row this app
  // decoded for itself.
  it("does not confirm a game the service cannot answer for", async () => {
    state.service = "down";
    const { client, wrapper } = harness(true);
    const { result } = renderHook(() => useVaultGame(null), { wrapper });
    expect(await result.current.confirmGame(9)).toBe(false);
    expect(state.chain).not.toHaveBeenCalled();
    expect(client.getQueryData(VAULT_KEYS.game(9))).toBeUndefined();
  });

  // The bug behind "I created a game, opened it, and saw an empty pot with no
  // countdown". The service does not 404 for a game the chain has not caught
  // up with: it answers from the contract a block or two behind the receipt,
  // so the row is real and the round has not started. Seeding that marks it
  // FRESH, the arena renders it, and with the socket up nothing refetches. The
  // same game opened from the lobby was fine, because nothing seeded it there.
  it("does not seed a row whose round has not started", async () => {
    vi.useFakeTimers();
    state.service = "unstarted";
    const { client, wrapper } = harness(true);
    const { result } = renderHook(() => useVaultGame(null), { wrapper });
    const confirmed = result.current.confirmGame(9);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(await confirmed).toBe(false);
    expect(client.getQueryData(VAULT_KEYS.game(9))).toBeUndefined();
    expect(client.getQueryData(VAULT_KEYS.games)).toBeUndefined();
  });

  // Same 200, different wrong row. Ids repeat across contract generations, so
  // an id the current contract has not reached still answers with the retired
  // contract's settled game. A game the caller created a moment ago cannot
  // already be over, so that row is never the one they just paid for.
  it("does not seed a settled row from the retired contract", async () => {
    vi.useFakeTimers();
    state.service = "legacy";
    const { client, wrapper } = harness(true);
    const { result } = renderHook(() => useVaultGame(null), { wrapper });
    const confirmed = result.current.confirmGame(194);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(await confirmed).toBe(false);
    expect(client.getQueryData(VAULT_KEYS.game(194))).toBeUndefined();
  });

  it("keeps asking until the round is live, then seeds that", async () => {
    vi.useFakeTimers();
    state.service = "unstarted";
    const { client, wrapper } = harness(true);
    const { result } = renderHook(() => useVaultGame(null), { wrapper });
    const timer = setInterval(() => {
      state.service = "ok";
    }, 1_000);
    const confirmed = result.current.confirmGame(9);
    await vi.advanceTimersByTimeAsync(3_000);
    clearInterval(timer);
    expect(await confirmed).toBe(true);
    expect(client.getQueryData(VAULT_KEYS.game(9))).toMatchObject({ gameId: 9, active: true });
  });
});
describe("useVaultGame and the followed game", () => {
  it("unfollows a game the moment it reads as settled", async () => {
    state.followed = 7;
    state.service = "settled";
    const { wrapper } = harness();
    renderHook(() => useVaultGame(7), { wrapper });
    await waitFor(() => expect(state.unfollow).toHaveBeenCalledTimes(1));
  });

  it("unfollows a game that was never started", async () => {
    state.followed = 7;
    state.service = "missing";
    const { wrapper } = harness();
    renderHook(() => useVaultGame(7), { wrapper });
    await waitFor(() => expect(state.unfollow).toHaveBeenCalledTimes(1));
  });

  it("leaves a live game followed, and never unfollows a game it is not following", async () => {
    state.followed = 8;
    const { wrapper } = harness();
    const { result } = renderHook(() => useVaultGame(7), { wrapper });
    await waitFor(() => expect(result.current.game).not.toBeNull());
    expect(state.unfollow).not.toHaveBeenCalled();
  });
});

describe("useVaultGame connection health", () => {
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
    state.service = "down";
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
