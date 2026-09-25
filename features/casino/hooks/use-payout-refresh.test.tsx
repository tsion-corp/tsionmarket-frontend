import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import type { Portfolio } from "@/lib/server/alchemy";

const ME = "0x6Fe0c92D880678F86a7d213695757ed58B09877F";

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
  useSessionWallet: (chain: string) => (chain === "ethereum" ? ME : null),
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/casino/last-standing" }));

import { resetPayoutCredits, usePayoutRefresh } from "@/features/casino/hooks/use-payout-refresh";
import { useGameBalance } from "@/features/casino/hooks/use-game-balance";
import {
  noteSettlement,
  resetSettlements,
  settlementFromFrame,
} from "@/features/casino/lib/last-standing/settlements";

const money = (amount: string) => ({ amount, tokenSymbol: "ETH", usdValue: 0, formattedUsd: "" });
// Game 425 on 2026-09-10, settled by the keeper while the player watched.
const ROW_425 = {
  gameId: 425,
  winner: ME,
  starter: ME,
  pot: money("0.000201231206442684"),
  toWinner: money("0.000100615603221342"),
  toStarter: money("0.000020123120644268"),
  toTreasury: money("0.000080492482577074"),
  paidToWinner: money("0.00012073872386561"),
  settlementTx: "0x5774d5c805e206bf70a3d4a09b69f17bf5261ce50564a8cc44349f8abb6cbbcc",
  settledAt: new Date().toISOString(),
};

// The stakeable balance is USDC from v5 on, so that is the row the hook reads.
// The ETH row stays in the fixture on purpose: a hook reading it instead would
// report a different figure entirely rather than failing outright.
const wallet: Portfolio = {
  totalUsd: 9.055,
  tokens: [
    {
      symbol: "ETH",
      name: "Ether",
      network: "base-mainnet",
      address: null,
      decimals: 18,
      kind: "coin",
      balance: 0.002,
      rawBalance: "2000000000000000",
      priceUsd: 4500,
      valueUsd: 9,
      logo: null,
    },
    {
      symbol: "USDC",
      name: "USD Coin",
      network: "base-mainnet",
      address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      decimals: 6,
      kind: "stablecoin",
      balance: 0.055,
      rawBalance: "55000",
      priceUsd: 1,
      valueUsd: 0.055,
      logo: null,
    },
  ],
};

function answer(body: Portfolio) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
const freshReads = () =>
  apiFetch.mock.calls.filter((call) => String(call[0]).includes("fresh=base-mainnet")).length;

describe("usePayoutRefresh", () => {
  let client: QueryClient;
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );

  beforeEach(() => {
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    apiFetch.mockReset();
    apiFetch.mockImplementation(async () => answer(wallet));
    resetSettlements();
    resetPayoutCredits();
  });
  afterEach(() => client.clear());

  // The 3001 session on 2026-09-10: game 425 settled while the lobby was
  // open and the card stayed at the post-stake figure. The socket's settle
  // frame names the wallet and the shares, so the lobby credits them and
  // confirms with one fresh read of Base.
  it("credits a settle frame for this wallet once, with one fresh read", async () => {
    const { result } = renderHook(
      () => {
        usePayoutRefresh(ME);
        return useGameBalance();
      },
      { wrapper }
    );
    await vi.waitFor(() => expect(result.current.balanceUsd).toBeCloseTo(0.055, 6));

    act(() => {
      noteSettlement(
        settlementFromFrame({
          gameId: 425,
          winner: ME,
          starter: ME,
          toWinnerWei: "100615603221342",
          toStarterWei: "20123120644268",
          transactionHash: ROW_425.settlementTx,
        })
      );
    });
    // One fresh read of Base, and no optimistic credit: the payout is USDC now,
    // and the only optimistic helper we had moves the NATIVE row, so applying
    // it here would credit the player's ETH for a dollar payout and show money
    // that is not there.
    await vi.waitFor(() => expect(freshReads()).toBe(1));
    const eth = client
      .getQueryData<Portfolio>(["portfolio", "base", ME])
      ?.tokens.find((token) => token.address === null);
    expect(eth?.rawBalance).toBe("2000000000000000");

    // The winners row for the same settlement arrives on the game page: not again.
    const page = renderHook(() => usePayoutRefresh(ME, [ROW_425]), { wrapper });
    await act(async () => {
      await Promise.resolve();
    });
    expect(freshReads()).toBe(1);
    page.unmount();
  });

  it("reads Base once from a winners row when the socket said nothing", async () => {
    const { result } = renderHook(() => useGameBalance(), { wrapper });
    await vi.waitFor(() => expect(result.current.balanceUsd).toBeCloseTo(0.055, 6));

    renderHook(() => usePayoutRefresh(ME, [ROW_425]), { wrapper });

    await vi.waitFor(() => expect(freshReads()).toBe(1));
    // The balance is whatever that read says, not a figure computed here.
    await vi.waitFor(() => expect(result.current.holding?.rawBalance).toBe("55000"));
  });

  it("ignores another wallet's win and a settlement older than two minutes", async () => {
    const old = { ...ROW_425, settledAt: new Date(Date.now() - 3 * 60_000).toISOString() };
    const theirs = {
      ...ROW_425,
      winner: "0x000000000000000000000000000000000000dead",
      starter: "0x000000000000000000000000000000000000beef",
      settlementTx: "0x2",
    };
    renderHook(() => usePayoutRefresh(ME, [old]), { wrapper });
    renderHook(() => usePayoutRefresh(ME, [theirs]), { wrapper });
    await act(async () => {
      await Promise.resolve();
    });
    expect(freshReads()).toBe(0);
  });
});
