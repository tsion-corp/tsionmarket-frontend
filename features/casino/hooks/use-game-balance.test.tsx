import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import type { Portfolio } from "@/lib/server/alchemy";

const EVM = "0x6Fe0c92D880678F86a7d213695757ed58B09877F";

const apiFetch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ apiFetch }));
vi.mock("@privy-io/react-auth", () => ({
  usePrivy: () => ({ ready: true, authenticated: true, user: null }),
}));
vi.mock("@/components/providers/server-session", () => ({
  useSessionWallet: (chain: string) => (chain === "ethereum" ? EVM : null),
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/casino/last-standing" }));

import { useGameBalance } from "@/features/casino/hooks/use-game-balance";

// The wallet from the 2026-09-10 test session: $0.55 of ETH on Base before
// game 424 was started with a $0.49 stake.
const STAKE_WEI = 180_000_000_000_000n;
const before: Portfolio = {
  totalUsd: 0.55,
  tokens: [
    {
      symbol: "ETH",
      name: "Ether",
      network: "base-mainnet",
      address: null,
      decimals: 18,
      kind: "coin",
      balance: 0.0002,
      rawBalance: "200000000000000",
      priceUsd: 2750,
      valueUsd: 0.55,
      logo: null,
    },
  ],
};
const afterOnChain: Portfolio = {
  totalUsd: 0.055,
  tokens: [
    { ...before.tokens[0], balance: 0.00002, rawBalance: "20000000000000", valueUsd: 0.055 },
  ],
};

function answer(body: Portfolio) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

const requestedUrls = () => apiFetch.mock.calls.map((call) => String(call[0]));

describe("useGameBalance", () => {
  let client: QueryClient;
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );

  beforeEach(() => {
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    apiFetch.mockReset();
    apiFetch.mockImplementation(async () => answer(before));
  });
  afterEach(() => client.clear());

  // Seen in the lobby on 2026-09-10: the balance card still said $0.55 half
  // way through the round it had just paid $0.49 into. The stake is the
  // transaction's value, known exactly, so the card moves the moment the
  // receipt lands; one fresh read of Base, and only Base, confirms it.
  it("moves the balance at once and confirms it with one fresh read of Base", async () => {
    const { result } = renderHook(() => useGameBalance(), { wrapper });
    await vi.waitFor(() => expect(result.current.balanceUsd).toBe(0.55));
    const polls = apiFetch.mock.calls.length;

    apiFetch.mockImplementation(async () => answer(afterOnChain));
    let settled: Promise<void> | undefined;
    act(() => {
      settled = result.current.settle(-STAKE_WEI);
    });
    // Before any answer comes back, the cache already shows the stake gone;
    // the card follows on the next tick.
    expect(client.getQueryData<Portfolio>(["portfolio", EVM, null])?.tokens[0].rawBalance).toBe(
      "20000000000000"
    );
    await vi.waitFor(() => expect(result.current.balanceUsd).toBeCloseTo(0.055, 6));

    await act(async () => {
      await settled;
    });
    const fresh = requestedUrls().slice(polls);
    expect(fresh).toHaveLength(1);
    expect(fresh[0]).toContain("fresh=base-mainnet");
    expect(fresh[0]).not.toContain("fresh=1");
    expect(result.current.balanceUsd).toBeCloseTo(0.055, 6);
    expect(result.current.balanceEth).toBeCloseTo(0.00002, 9);
  });

  // A confirming read that fails (a poor connection, a slow node) leaves the
  // applied figure on screen; the regular poll corrects it later.
  it("keeps the applied figure when the confirming read fails", async () => {
    const { result } = renderHook(() => useGameBalance(), { wrapper });
    await vi.waitFor(() => expect(result.current.balanceUsd).toBe(0.55));

    vi.useFakeTimers();
    try {
      apiFetch.mockImplementation(async () => {
        throw new Error("Failed to fetch");
      });
      let settled: Promise<void> | undefined;
      act(() => {
        settled = result.current.settle(-STAKE_WEI);
      });
      // The read retries with backoff for a while; the figure never reverts.
      await act(() => vi.advanceTimersByTimeAsync(30_000));
      await act(async () => {
        await settled;
      });
      expect(result.current.balanceUsd).toBeCloseTo(0.055, 6);
      expect(result.current.holding?.rawBalance).toBe("20000000000000");
    } finally {
      vi.useRealTimers();
    }
  });
});
