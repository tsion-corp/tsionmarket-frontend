import { render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { createQueryClient } from "@/lib/query-client";
import type { TokenBalance } from "@/hooks/use-portfolio";

// A WIRING test, not a mechanism one. The card is rendered for real with the
// fetch boundary, the session and the data hooks stubbed. "Ready to spend" is
// the stablecoin sum of the portfolio the card already holds (read on-chain
// through the RPC pool); the user-management balance endpoint, which #558 had
// put behind this figure with no fallback, is down and is not asked at all.

// Real English, with the one message that takes a value interpolated, so the
// assertions below read the string a user reads.
const MESSAGES: Record<string, Record<string, string>> = {
  auth: {
    signIn: "Sign in",
    signInToSeeBalance: "Sign in to see your balance",
    "gate.fund": "Sign in to add funds",
    "gate.withdraw": "Sign in to withdraw",
  },
  balance: {
    totalBalance: "Total balance",
    showBalance: "Show balance",
    hideBalance: "Hide balance",
    readyToSpend: "{amount} ready to spend",
    addFunds: "Add funds",
    withdraw: "Withdraw",
    couldntLoad: "Couldn't load",
    readyToSpendUnknown: "Ready to spend unavailable",
    portfolioAllocation: "Portfolio allocation",
    depositPending: "Your deposit is settling.",
    assetsHeld: "assets",
    breakdownEmpty: "Nothing held yet.",
    slice_cash: "Cash",
    slice_coins: "Coins",
    slice_realAssets: "Real assets",
    slice_tokens: "Tokens",
  },
  portfolio: {
    yourHoldings: "Your holdings",
    searchHoldings: "Search your holdings",
    searchPlaceholder: "Search",
    noSearchMatches: "No holdings match your search.",
    emptyTitle: "Your portfolio is empty",
    emptyBody: "Add funds to get started.",
    addFunds: "Add funds",
    holdings: "Holdings",
    marketPrice: "Market price",
    network: "Network",
    positionValue: "Position value",
    buyMore: "Buy more",
    sell: "Sell",
    kindToken: "Token",
  },
};
vi.mock("next-intl", () => ({
  useTranslations: (namespace: string) => (key: string, values?: Record<string, unknown>) => {
    const message = MESSAGES[namespace]?.[key] ?? `${namespace}.${key}`;
    return message.replace(/\{(\w+)\}/gu, (whole, name: string) =>
      values && name in values ? String(values[name]) : whole
    );
  },
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

vi.mock("@/components/ui/currency-select", () => ({
  CurrencySelect: () => (
    <button type="button" data-testid="currency-select">
      USD
    </button>
  ),
  useMoney: () => ({
    currency: { code: "USD", symbol: "$" },
    setCurrency: vi.fn(),
    format: (usd: number) => `$${usd.toFixed(2)}`,
    formatExact: (usd: number) => `$${usd.toFixed(2)}`,
  }),
}));

vi.mock("@/components/layout/modals/app-modals", () => ({
  useAppModals: () => ({
    modal: null,
    openDetail: vi.fn(),
    openBuy: vi.fn(),
    openSell: vi.fn(),
    openRwaTrade: vi.fn(),
    openMemeSell: vi.fn(),
    openFunds: vi.fn(),
    close: vi.fn(),
    showDone: vi.fn(),
  }),
  AppModalHost: () => null,
}));

// The portfolio path, stubbed at its hook: the headline total, the token list,
// the breakdown and the ready-to-spend figure all read from it.
const portfolio = vi.hoisted(() => ({ usePortfolio: vi.fn() }));
vi.mock("@/hooks/use-portfolio", () => portfolio);

const globalBalance = vi.hoisted(() => ({ useGlobalBalance: vi.fn() }));
vi.mock("@/hooks/use-global-balance", () => globalBalance);

const ramping = vi.hoisted(() => ({ usePendingBankDeposit: vi.fn() }));
vi.mock("@/hooks/use-ramping", () => ramping);

const apiFetch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ apiFetch }));

// The address in the sample payload, as the session hands it back: EIP-55
// checksummed where the service writes lowercase.
const WALLET = "0x72F2578adE01ca5a844Cb0a46dC1943BbD233ACa";
const ALICE = "did:privy:alice";

const session = vi.hoisted(() => ({
  ready: true,
  authenticated: true,
  userId: null as string | null,
  evmAddress: null as string | null,
  solanaAddress: null as string | null,
  profile: { name: "u", email: "", avatarSeed: "u" },
  logout: async () => {},
}));
vi.mock("@/hooks/use-auth-session", () => ({ useAuthSession: () => session }));

import { BalanceVisibilityProvider } from "@/components/ui/balance-visibility";
import { BalanceCard } from "@/features/portfolio/components/balance-card";

function answer(data: unknown) {
  return new Response(JSON.stringify({ success: true, data }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function refusal(code: string, status: number) {
  return new Response(JSON.stringify({ success: false, error: { code, message: "no" } }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// A stablecoin holding in the portfolio. The endpoint fixture, were it ever
// read, reports 0.128718 USDC; the two cannot be confused on screen.
const portfolioCash: TokenBalance = {
  symbol: "USDC",
  name: "USD Coin",
  network: "base-mainnet",
  address: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
  decimals: 6,
  kind: "stablecoin",
  balance: 999,
  rawBalance: "999000000",
  priceUsd: 1,
  valueUsd: 999,
  logo: null,
};

const BALANCE_URL = `/api/user-management/users/${encodeURIComponent(ALICE)}/balance`;

let client: QueryClient;

const onOpenFunds = vi.fn();
const onOpenWithdraw = vi.fn();

function renderCard() {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <BalanceVisibilityProvider>{children}</BalanceVisibilityProvider>
    </QueryClientProvider>
  );
  return render(
    <BalanceCard onOpenFunds={onOpenFunds} onOpenWithdraw={onOpenWithdraw} onTakeTour={vi.fn()} />,
    { wrapper }
  );
}

// Both breakpoints mount (Responsive draws both trees and lets CSS choose), so
// every figure on the card appears twice. Asserting on all of them is the
// point: the phone card and the desktop card must not disagree about money.
function readyToSpendRows() {
  return screen.getAllByTestId("ready-to-spend").map((row) => row.textContent);
}

function withdrawButtons() {
  return screen.getAllByRole("button", { name: "Withdraw" }) as HTMLButtonElement[];
}

describe("BalanceCard ready to spend", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client = createQueryClient();
    client.setDefaultOptions({ queries: { ...client.getDefaultOptions().queries, retry: false } });
    session.ready = true;
    session.authenticated = true;
    session.userId = ALICE;
    session.evmAddress = WALLET;
    portfolio.usePortfolio.mockReturnValue({
      tokens: [portfolioCash],
      loading: false,
      refreshing: false,
      error: null,
      refetch: vi.fn(),
    });
    globalBalance.useGlobalBalance.mockReturnValue({ totalUsd: 1234 });
    ramping.usePendingBankDeposit.mockReturnValue({ pending: false });
    // The endpoint, if anything asked: a refusal, so a read that sneaks back in
    // shows as "unavailable" rather than passing on its fixture.
    apiFetch.mockResolvedValue(refusal("UNAVAILABLE", 503));
  });

  afterEach(() => {
    client.clear();
  });

  it("shows the portfolio's stablecoin sum and never asks the balance endpoint", async () => {
    renderCard();

    await waitFor(() =>
      expect(readyToSpendRows()).toEqual(["$999.00 ready to spend", "$999.00 ready to spend"])
    );
    expect(apiFetch).not.toHaveBeenCalled();
    expect(String(BALANCE_URL)).toContain("/balance");
  });

  it("keeps the headline total on its own path", async () => {
    renderCard();
    await waitFor(() => expect(readyToSpendRows().length).toBe(2));
    expect(screen.getAllByText("$1234.00").length).toBe(2);
  });

  it("counts only stablecoins, not every holding", async () => {
    portfolio.usePortfolio.mockReturnValue({
      tokens: [
        portfolioCash,
        { ...portfolioCash, symbol: "ETH", name: "Ether", kind: "coin", valueUsd: 500 },
      ],
      loading: false,
      refreshing: false,
      error: null,
      refetch: vi.fn(),
    });
    renderCard();
    await waitFor(() =>
      expect(readyToSpendRows()).toEqual(["$999.00 ready to spend", "$999.00 ready to spend"])
    );
  });

  // With the figure on the portfolio, "on its way" and "could not load" are
  // the card's own states: the whole card is a skeleton while the portfolio
  // loads, and "Couldn't load" when it failed with nothing cached. In neither
  // is a ready-to-spend row drawn, and in neither is a zero claimed.
  it("claims no figure while the portfolio is still on its way", async () => {
    portfolio.usePortfolio.mockReturnValue({
      tokens: [],
      loading: true,
      refreshing: false,
      error: null,
      refetch: vi.fn(),
    });
    renderCard();
    await waitFor(() => expect(screen.getAllByText("Total balance").length).toBe(2));
    expect(screen.queryAllByTestId("ready-to-spend")).toHaveLength(0);
    expect(screen.queryByText("$0.00 ready to spend")).toBeNull();
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("says it could not load, not zero, when the portfolio failed with nothing cached", async () => {
    portfolio.usePortfolio.mockReturnValue({
      tokens: [],
      loading: false,
      refreshing: false,
      error: new Error("rpc down"),
      refetch: vi.fn(),
    });
    ramping.usePendingBankDeposit.mockReturnValue({ pending: true });
    renderCard();

    await waitFor(() => expect(screen.getAllByText("Couldn't load").length).toBe(2));
    expect(screen.queryAllByTestId("ready-to-spend")).toHaveLength(0);
    expect(screen.queryByText("$0.00 ready to spend")).toBeNull();
    // An unknown figure never holds the withdraw button.
    for (const button of withdrawButtons()) expect(button).toBeEnabled();
  });

  it("holds the withdraw button on a settling deposit when the cash really is zero", async () => {
    portfolio.usePortfolio.mockReturnValue({
      tokens: [{ ...portfolioCash, symbol: "ETH", name: "Ether", kind: "coin", valueUsd: 500 }],
      loading: false,
      refreshing: false,
      error: null,
      refetch: vi.fn(),
    });
    ramping.usePendingBankDeposit.mockReturnValue({ pending: true });
    renderCard();

    await waitFor(() =>
      expect(readyToSpendRows()).toEqual(["$0.00 ready to spend", "$0.00 ready to spend"])
    );
    for (const button of withdrawButtons()) expect(button).toBeDisabled();
  });
});

describe("BalanceCard signed out", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client = createQueryClient();
    session.ready = true;
    session.authenticated = false;
    session.userId = null;
    session.evmAddress = null;
    portfolio.usePortfolio.mockReturnValue({
      tokens: [],
      loading: false,
      refreshing: false,
      error: null,
      refetch: vi.fn(),
    });
    globalBalance.useGlobalBalance.mockReturnValue({ totalUsd: 0 });
    ramping.usePendingBankDeposit.mockReturnValue({ pending: false });
  });

  afterEach(() => {
    client.clear();
  });

  it("asks the visitor to sign in instead of claiming an empty wallet", async () => {
    renderCard();
    await waitFor(() => expect(readyToSpendRows().length).toBe(2));
    expect(readyToSpendRows()).toEqual([
      "Sign in to see your balance",
      "Sign in to see your balance",
    ]);
    expect(screen.queryByText(/ready to spend/)).toBeNull();
  });

  it("does not open funding or withdrawal without a session", async () => {
    renderCard();
    await waitFor(() => expect(readyToSpendRows().length).toBe(2));
    for (const button of screen.getAllByRole("button", { name: "Add funds" })) button.click();
    for (const button of withdrawButtons()) button.click();
    expect(onOpenFunds).not.toHaveBeenCalled();
    expect(onOpenWithdraw).not.toHaveBeenCalled();
  });
});
