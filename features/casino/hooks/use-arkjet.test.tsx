import { act, cleanup, renderHook } from "@testing-library/react";
import { focusManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  fetchArkjetCurrentRound: vi.fn(),
  fetchArkjetRoundHistory: vi.fn(),
  fetchArkjetSimulatedActivity: vi.fn(),
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
  evmAddress: "0x00000000000000000000000000000000000000aA",
  solanaAddress: null,
  profile: { name: "u1", email: "", avatarSeed: "u1" },
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
  isArkjetSimulatedActivityFeed: (value: unknown) =>
    Boolean(value && typeof value === "object" && "isSimulated" in value && "items" in value),
  sendArkjetCommand: live.sendArkjetCommand,
  subscribeArkjetTopics: live.subscribeArkjetTopics,
}));
// The hooks read the Decane session (useAuthSession), not Privy — the whole
// point of this branch. `auth.evmAddress` stands where `auth.user.id` did:
// it is the identity the queries are keyed on.
vi.mock("@/hooks/use-auth-session", () => ({
  useAuthSession: () => auth,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { ARKJET_KEYS, useArkjet } from "./use-arkjet";

let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);
const round = { roundId: "round-1", status: "COMMITTED" };

beforeEach(() => {
  vi.useFakeTimers();
  auth.evmAddress = "0x00000000000000000000000000000000000000aA";
  auth.authenticated = true;
  client = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } });
  for (const mock of Object.values(api)) mock.mockReset();
  live.sendArkjetCommand.mockReset();
  live.subscribeArkjetTopics.mockClear();
  api.fetchArkjetCurrentRound.mockResolvedValue(round);
  api.fetchArkjetRoundHistory.mockResolvedValue({ items: [] });
  api.fetchArkjetSimulatedActivity.mockResolvedValue({
    roundId: "round-1",
    source: "simulation",
    isSimulated: true,
    items: [],
  });
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
    // A different account: its balance must not be read from the first
    // account's cache.
    auth.evmAddress = "0x00000000000000000000000000000000000000bB";
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
    expect(api.fetchArkjetSimulatedActivity.mock.calls.length).toBeLessThanOrEqual(2);
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
    expect(api.fetchArkjetSimulatedActivity).toHaveBeenCalledTimes(1);
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
    expect(api.fetchArkjetSimulatedActivity).toHaveBeenCalledTimes(2);
  });

  it("coalesces live activity bursts into the latest 100ms snapshot", async () => {
    renderHook(() => useArkjet(), { wrapper });
    await act(() => vi.advanceTimersByTimeAsync(0));
    const calls = live.subscribeArkjetTopics.mock.calls as unknown as Array<
      [string | null, (frame: { type: string; data: unknown }) => void]
    >;
    const listener = calls.at(-1)?.[1];
    expect(listener).toBeTypeOf("function");

    const first = { roundId: "round-1", source: "simulation", isSimulated: true, items: [1] };
    const latest = { roundId: "round-1", source: "simulation", isSimulated: true, items: [1, 2] };
    act(() => {
      listener?.({ type: "simulatedActivityUpdated", data: first });
      listener?.({ type: "simulatedActivityUpdated", data: latest });
    });
    expect(client.getQueryData(ARKJET_KEYS.activity)).not.toEqual(latest);

    await act(() => vi.advanceTimersByTimeAsync(100));
    expect(client.getQueryData(ARKJET_KEYS.activity)).toEqual(latest);
  });
});
