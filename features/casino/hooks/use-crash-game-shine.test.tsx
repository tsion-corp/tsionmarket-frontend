import type { ReactNode } from "react";
import { act, cleanup, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Arkjet and Pilot Chicken are the two arcade games whose result IS a resolved
// promise: one press, one response. These tests pin that down — the report
// comes off the cash-out mutation, and the polled rows that carry the same
// settlement afterwards say nothing.
const shine = vi.hoisted(() => ({ reportShine: vi.fn() }));
vi.mock("@/lib/shine", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/shine")>()),
  reportShine: shine.reportShine,
}));

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
  fetchArkjetSimulatedActivity: vi.fn(),
  fetchChickenRules: vi.fn(),
  fetchActiveChicken: vi.fn(),
  fetchChickenHistory: vi.fn(),
  startChicken: vi.fn(),
  stepChicken: vi.fn(),
  cashoutChicken: vi.fn(),
}));
vi.mock("@/features/casino/lib/api/arkjet", () => api);
// Both games try the live socket first and fall back to HTTP when it is not
// there. The socket is not what these tests are about, so it answers "not
// available" and every command lands on the API fakes above.
const socketDown = vi.hoisted(() => () => Promise.reject({ code: "SOCKET_UNAVAILABLE" }));
vi.mock("@/features/casino/lib/arkjet/live-socket", () => ({
  ARKJET_SOCKET_CLOSED: { type: "__closed" },
  ARKJET_SOCKET_READY: { type: "__ready" },
  ARKJET_SOCKET_RESYNC: { type: "__resync" },
  isArkjetBet: (value: unknown) => Boolean(value && typeof value === "object" && "betId" in value),
  isArkjetRound: (value: unknown) =>
    Boolean(value && typeof value === "object" && "roundId" in value && "sequence" in value),
  isArkjetSimulatedActivityFeed: (value: unknown) =>
    Boolean(value && typeof value === "object" && "isSimulated" in value && "items" in value),
  sendArkjetCommand: socketDown,
  subscribeArkjetTopics: () => () => undefined,
}));
vi.mock("@/features/casino/lib/chicken/live-socket", () => ({
  CHICKEN_SOCKET_CLOSED: { type: "__closed" },
  CHICKEN_SOCKET_READY: { type: "__ready" },
  CHICKEN_SOCKET_RESYNC: { type: "__resync" },
  isChickenSession: (value: unknown) =>
    Boolean(value && typeof value === "object" && "sessionId" in value),
  sendChickenCommand: socketDown,
  subscribeChickenTopic: () => () => undefined,
}));
// The hooks read the Decane session, not Privy; the address is the identity
// their queries are keyed on.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/hooks/use-auth-session", () => ({
  useAuthSession: () => ({
    ready: true,
    authenticated: true,
    userId: "user-1",
    evmAddress: "0x00000000000000000000000000000000000000aA",
    solanaAddress: null,
    profile: { name: "u1", email: "", avatarSeed: "u1" },
    logout: vi.fn(),
  }),
}));

import { useArkjet } from "@/features/casino/hooks/use-arkjet";
import { useChicken } from "@/features/casino/hooks/use-chicken";
import type { ArkjetBet, ChickenSession } from "@/features/casino/lib/api/arkjet";

function bet(over: Partial<ArkjetBet> = {}): ArkjetBet {
  return {
    betId: "bet-1",
    roundId: "round-1",
    panelId: "A",
    currency: "USDC",
    amount: "5",
    maximumCashoutMultiplier: "100",
    automaticCashoutMultiplier: null,
    maximumPayout: "500",
    reservedNetLiability: "0",
    status: "CASHED_OUT",
    cashoutMultiplier: "2.5",
    payout: "12.5",
    idempotencyKey: "key-1",
    acceptedAt: "2026-09-24T10:00:00.000Z",
    settledAt: "2026-09-24T10:00:30.000Z",
    ...over,
  };
}

function session(over: Partial<ChickenSession> = {}): ChickenSession {
  return {
    sessionId: "chicken-1",
    status: "cashed_out",
    difficulty: "easy",
    currency: "USDC",
    amount: "1",
    maximumStep: 24,
    maximumPayableStep: 24,
    liquidityCrashStep: null,
    currentStep: 3,
    attemptedSteps: 3,
    currentMultiplier: "1.86",
    potentialPayout: "1.86",
    maximumPayout: "100",
    reservedNetLiability: "0",
    payout: "1.86",
    serverSeedCommitment: "0xcommit",
    serverSeed: "0xseed",
    clientSeed: "web-1",
    algorithmVersion: "v1",
    rtpBasisPoints: 9_700,
    version: 4,
    steps: [],
    startedAt: "2026-09-24T10:00:00.000Z",
    settledAt: "2026-09-24T10:01:00.000Z",
    ...over,
  };
}

let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  shine.reportShine.mockReset();
  for (const mock of Object.values(api)) mock.mockReset();
  api.fetchArkjetCurrentRound.mockResolvedValue({ roundId: "round-1", status: "COMMITTED" });
  api.fetchArkjetRoundHistory.mockResolvedValue({ items: [] });
  api.fetchArkjetCurrentBets.mockResolvedValue({ items: [] });
  api.fetchArkjetBalance.mockResolvedValue({ available: "10", currency: "USDC" });
  api.fetchArkjetCapabilities.mockResolvedValue({ wageringEnabled: true });
  api.fetchArkjetFairnessRules.mockResolvedValue({});
  api.fetchArkjetRiskRules.mockResolvedValue({});
  api.fetchChickenRules.mockResolvedValue({});
  api.fetchActiveChicken.mockResolvedValue(null);
  api.fetchChickenHistory.mockResolvedValue({ items: [] });
});
afterEach(() => {
  cleanup();
  client.clear();
});

describe("Arkjet", () => {
  it("reports one win per cash-out, off the resolved response", async () => {
    api.cashoutArkjetBet.mockResolvedValue(bet());
    const { result } = renderHook(() => useArkjet(), { wrapper });
    await act(async () => {
      await result.current.cashoutBet("bet-1");
    });

    expect(shine.reportShine).toHaveBeenCalledTimes(1);
    expect(shine.reportShine).toHaveBeenCalledWith({
      service: "arcade",
      id: "arkjet:bet-1",
      game: "Arkjet",
      outcome: "won",
      pnl: "+150%",
    });
  });

  it("reports nothing for a crash, a cancellation or a break-even press", async () => {
    const { result } = renderHook(() => useArkjet(), { wrapper });
    for (const settled of [
      bet({ status: "LOST", payout: "0" }),
      bet({ status: "CANCELLED", payout: null }),
      bet({ payout: "5" }),
    ]) {
      api.cashoutArkjetBet.mockResolvedValue(settled);
      await act(async () => {
        await result.current.cashoutBet("bet-1");
      });
    }
    expect(shine.reportShine).not.toHaveBeenCalled();
  });

  it("says nothing when the bets poll re-serves the settled row", async () => {
    // This is the re-fire the ADR is written against: the bets query refetches
    // every two seconds while a round is live and on every refocus, and it
    // carries the same CASHED_OUT bet each time.
    api.fetchArkjetCurrentBets.mockResolvedValue({ items: [bet()] });
    const { rerender } = renderHook(() => useArkjet(), { wrapper });
    await act(async () => {
      await Promise.resolve();
    });
    rerender();
    rerender();

    expect(shine.reportShine).not.toHaveBeenCalled();
  });
});

describe("Pilot Chicken", () => {
  it("reports one win per cash-out", async () => {
    api.cashoutChicken.mockResolvedValue(session());
    const { result } = renderHook(() => useChicken(), { wrapper });
    await act(async () => {
      await result.current.cashout(session({ status: "active", payout: null }));
    });

    expect(shine.reportShine).toHaveBeenCalledTimes(1);
    expect(shine.reportShine).toHaveBeenCalledWith({
      service: "arcade",
      id: "chicken:chicken-1",
      game: "Pilot Chicken",
      outcome: "won",
      pnl: "+86%",
    });
  });

  it("reports nothing when a crossing ends the run", async () => {
    api.stepChicken.mockResolvedValue(session({ status: "lost", payout: "0" }));
    const { result } = renderHook(() => useChicken(), { wrapper });
    await act(async () => {
      await result.current.step(session({ status: "active", payout: null }));
    });
    expect(shine.reportShine).not.toHaveBeenCalled();
  });

  it("says nothing when the history query re-serves cashed-out sessions", async () => {
    api.fetchChickenHistory.mockResolvedValue({
      items: [session(), session({ sessionId: "c-2" })],
    });
    const { rerender } = renderHook(() => useChicken(), { wrapper });
    await act(async () => {
      await Promise.resolve();
    });
    rerender();

    expect(shine.reportShine).not.toHaveBeenCalled();
  });
});
