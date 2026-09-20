import { act, cleanup, renderHook } from "@testing-library/react";
import { focusManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  fetchArkjetCurrentRound: vi.fn(),
  fetchArkjetRoundHistory: vi.fn(),
  fetchArkjetCapabilities: vi.fn(),
  fetchArkjetFairnessRules: vi.fn(),
  fetchArkjetRiskRules: vi.fn(),
  fetchArkjetBalance: vi.fn(),
  fetchArkjetCurrentBets: vi.fn(),
  createArkjetBet: vi.fn(),
  cancelArkjetBet: vi.fn(),
  cashoutArkjetBet: vi.fn(),
}));
const auth = vi.hoisted(() => ({
  ready: true,
  authenticated: true,
  user: { id: "user-1" },
  login: vi.fn(),
}));
const live = vi.hoisted(() => ({
  sendArkjetCommand: vi.fn(),
  subscribeArkjetTopics: vi.fn(() => () => undefined),
}));
vi.mock("@/features/casino/lib/api/arkjet", () => api);
vi.mock("@/features/casino/lib/arkjet/live-socket", () => ({
  ARKJET_SOCKET_CLOSED: { type: "__closed" },
  ARKJET_SOCKET_READY: { type: "__ready" },
  ARKJET_SOCKET_RESYNC: { type: "__resync" },
  isArkjetBet: (value: unknown) => Boolean(value && typeof value === "object" && "betId" in value),
  isArkjetRound: (value: unknown) =>
    Boolean(value && typeof value === "object" && "roundId" in value && "sequence" in value),
  sendArkjetCommand: live.sendArkjetCommand,
  subscribeArkjetTopics: live.subscribeArkjetTopics,
}));
vi.mock("@privy-io/react-auth", () => ({
  usePrivy: () => auth,
}));

import { ARKJET_KEYS, useArkjet } from "./use-arkjet";

let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);
const round = { roundId: "round-1", status: "COMMITTED" };

beforeEach(() => {
  vi.useFakeTimers();
  auth.user = { id: "user-1" };
  auth.authenticated = true;
  client = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } });
  for (const mock of Object.values(api)) mock.mockReset();
  live.sendArkjetCommand.mockReset();
  live.subscribeArkjetTopics.mockClear();
  api.fetchArkjetCurrentRound.mockResolvedValue(round);
  api.fetchArkjetRoundHistory.mockResolvedValue({ items: [] });
  api.fetchArkjetCurrentBets.mockResolvedValue({ items: [] });
  api.fetchArkjetBalance.mockResolvedValue({ available: "0.5", currency: "USDC" });
  api.fetchArkjetCapabilities.mockResolvedValue({ wageringEnabled: true });
  api.fetchArkjetFairnessRules.mockResolvedValue({});
  api.fetchArkjetRiskRules.mockResolvedValue({});
});
afterEach(() => {
  cleanup();
  client.clear();
  focusManager.setFocused(undefined);
  vi.useRealTimers();
});

describe("Arkjet request cadence", () => {
  it("does not display another account's cached internal balance", async () => {
    const { result, rerender } = renderHook(() => useArkjet(), { wrapper });
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(result.current.balance?.available).toBe("0.5");
    api.fetchArkjetBalance.mockImplementation(() => new Promise(() => {}));
    auth.user = { id: "user-2" };
    rerender();
    expect(result.current.balance).toBeNull();
  });

  it("does not keep polling a background tab", async () => {
    renderHook(() => useArkjet(), { wrapper });
    await act(() => vi.advanceTimersByTimeAsync(0));
    focusManager.setFocused(false);
    await act(() => vi.advanceTimersByTimeAsync(30_000));
    expect(api.fetchArkjetCurrentRound).toHaveBeenCalledTimes(1);
    expect(api.fetchArkjetBalance).toHaveBeenCalledTimes(1);
    expect(api.fetchArkjetCurrentBets).toHaveBeenCalledTimes(1);
  });

  it("shares cached reads and limits idle round polling to one request per second", async () => {
    renderHook(() => useArkjet(), { wrapper });
    renderHook(() => useArkjet(), { wrapper });
    await act(() => vi.advanceTimersByTimeAsync(0));
    await act(() => vi.advanceTimersByTimeAsync(10_000));
    expect(api.fetchArkjetCurrentRound.mock.calls.length).toBeLessThanOrEqual(11);
    for (const mock of [
      api.fetchArkjetBalance,
      api.fetchArkjetCurrentBets,
      api.fetchArkjetRoundHistory,
      api.fetchArkjetCapabilities,
      api.fetchArkjetFairnessRules,
      api.fetchArkjetRiskRules,
    ])
      expect(mock).toHaveBeenCalledTimes(1);
  });

  it("backs off failed reads instead of retrying and polling through a 429", async () => {
    for (const mock of Object.values(api)) {
      mock.mockRejectedValue(Object.assign(new Error("Too many requests"), { status: 429 }));
    }
    renderHook(() => useArkjet(), { wrapper });
    await act(() => vi.advanceTimersByTimeAsync(0));
    await act(() => vi.advanceTimersByTimeAsync(10_000));
    expect(api.fetchArkjetCurrentRound).toHaveBeenCalledTimes(1);
    expect(api.fetchArkjetBalance).toHaveBeenCalledTimes(1);
    expect(api.fetchArkjetCurrentBets).toHaveBeenCalledTimes(1);
    expect(api.fetchArkjetRoundHistory).toHaveBeenCalledTimes(1);
  });

  it("refreshes settlement data once when a running round finishes", async () => {
    api.fetchArkjetCurrentRound.mockResolvedValue({ ...round, status: "RUNNING" });
    renderHook(() => useArkjet(), { wrapper });
    await act(() => vi.advanceTimersByTimeAsync(0));
    await act(async () => {
      client.setQueryData(ARKJET_KEYS.current, { ...round, status: "REVEALED" });
      await vi.advanceTimersByTimeAsync(10);
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(api.fetchArkjetBalance).toHaveBeenCalledTimes(2);
    expect(api.fetchArkjetCurrentBets).toHaveBeenCalledTimes(2);
    expect(api.fetchArkjetRoundHistory).toHaveBeenCalledTimes(2);
  });
});
