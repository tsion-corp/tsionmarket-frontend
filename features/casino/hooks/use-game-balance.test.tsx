import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import type { Portfolio } from "@/lib/server/alchemy";

const EVM = "0x6Fe0c92D880678F86a7d213695757ed58B09877F";

const apiFetch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ apiFetch }));
vi.mock("@/hooks/use-auth-session", () => ({
  useAuthSession: () => ({
    ready: true,
    authenticated: true,
    evmAddress: null,
    solanaAddress: null,
    profile: { name: "", email: "", avatarSeed: "" },
    logout: vi.fn(),
  }),
}));
vi.mock("@/components/providers/server-session", () => ({
  useSessionWallet: (chain: string) => (chain === "ethereum" ? EVM : null),
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/casino/last-standing" }));

import { useGameBalance } from "@/features/casino/hooks/use-game-balance";

// The game is played in USDC from v5 on, so the stakeable balance is the
// wallet's USDC on Base. The ETH row is deliberately present and richer: a hook
// that still read it would report $9.00 for a player holding 55 cents of USDC,
// which is the shape of the bug this replaced.
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const usdcRow = (rawBalance: string, balance: number, valueUsd: number) => ({
  symbol: "USDC",
  name: "USD Coin",
  network: "base-mainnet",
  address: USDC,
  decimals: 6,
  kind: "stablecoin" as const,
  balance,
  rawBalance,
  priceUsd: 1,
  valueUsd,
  logo: null,
});
const ethRow = {
  symbol: "ETH",
  name: "Ether",
  network: "base-mainnet",
  address: null,
  decimals: 18,
  kind: "coin" as const,
  balance: 0.002,
  rawBalance: "2000000000000000",
  priceUsd: 4500,
  valueUsd: 9,
  logo: null,
};
const before: Portfolio = {
  totalUsd: 9.55,
  tokens: [ethRow, usdcRow("550000", 0.55, 0.55)],
};
const afterOnChain: Portfolio = {
  totalUsd: 9.055,
  tokens: [ethRow, usdcRow("55000", 0.055, 0.055)],
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

  // The stakeable balance is USDC, not ETH. The fixture holds $9 of ETH beside
  // 55 cents of USDC, so a hook reading the wrong row is off by an order of
  // magnitude rather than off by a rounding.
  it("reports the USDC balance, not the wallet's ETH", async () => {
    const { result } = renderHook(() => useGameBalance(), { wrapper });
    await vi.waitFor(() => expect(result.current.balanceUsd).toBe(0.55));
    expect(result.current.balanceUnits).toBe(550_000n);
    expect(result.current.holding?.symbol).toBe("USDC");
  });

  // A stake leaves this balance and a payout lands in it, and neither is
  // visible to the portfolio's receipt path, so settling asks Base directly —
  // once, and only for Base.
  it("confirms a move with one fresh read of Base", async () => {
    const { result } = renderHook(() => useGameBalance(), { wrapper });
    await vi.waitFor(() => expect(result.current.balanceUsd).toBe(0.55));
    const polls = apiFetch.mock.calls.length;

    apiFetch.mockImplementation(async () => answer(afterOnChain));
    await act(async () => {
      await result.current.settle();
    });

    const fresh = requestedUrls().slice(polls);
    expect(fresh).toHaveLength(1);
    expect(fresh[0]).toContain("fresh=base-mainnet");
    expect(fresh[0]).not.toContain("fresh=1");
    await vi.waitFor(() => expect(result.current.balanceUsd).toBeCloseTo(0.055, 6));
  });

  // There is no optimistic step any more. applyNativeDelta moves the NATIVE
  // row, so using it for a USDC stake would credit the player's ETH and show
  // money that is not there; a scoped fresh read is one call and is true.
  it("never moves the native row on the player's behalf", async () => {
    const { result } = renderHook(() => useGameBalance(), { wrapper });
    await vi.waitFor(() => expect(result.current.balanceUsd).toBe(0.55));

    apiFetch.mockImplementation(async () => answer(afterOnChain));
    await act(async () => {
      await result.current.settle();
    });

    const eth = client
      .getQueryData<Portfolio>(["portfolio", "base", EVM])
      ?.tokens.find((token) => token.address === null);
    expect(eth?.rawBalance).toBe("2000000000000000");
  });

  // A confirming read that fails (a poor connection, a slow node) leaves the
  // last known figure on screen; the regular poll corrects it later. What must
  // not happen is the balance blanking to zero and telling a funded player they
  // cannot afford a game.
  it("keeps the last known figure when the confirming read fails", async () => {
    const { result } = renderHook(() => useGameBalance(), { wrapper });
    await vi.waitFor(() => expect(result.current.balanceUsd).toBe(0.55));

    vi.useFakeTimers();
    try {
      apiFetch.mockImplementation(async () => {
        throw new Error("Failed to fetch");
      });
      let settled: Promise<void> | undefined;
      act(() => {
        settled = result.current.settle().catch(() => {});
      });
      // The read retries with backoff for a while; the figure never reverts.
      await act(() => vi.advanceTimersByTimeAsync(30_000));
      await act(async () => {
        await settled;
      });
    } finally {
      vi.useRealTimers();
    }

    expect(result.current.balanceUsd).toBe(0.55);
  });
});
