import { render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { createQueryClient } from "@/lib/query-client";
import { balanceBody, emptyBalanceBody } from "@/lib/balance/fixture";
import type { TokenBalance } from "@/hooks/use-portfolio";

// A WIRING test, not a mechanism one. Everything between the card and the
// network stays real — useSpendableCash, useUserBalance, the query, the route
// constant, the browser parser, lib/balance/spendable — and only the fetch
// boundary, the session and the OTHER data hooks are stubbed. The complaint this
// file exists for is that nothing appeared in the network tab, which a test
// that mocked useUserBalance could never have caught.

// Real English, with the one message that takes a value interpolated, so the
// assertions below read the string a user reads.
const MESSAGES: Record<string, Record<string, string>> = {
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

// The incumbent portfolio path, stubbed at its hook: this card still reads the
// headline total, the token list and the breakdown from it, and only
// readyToSpend has moved.
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

// A stablecoin holding on the incumbent float path worth far more than the
// endpoint reports, so any test that reads the wrong source says so loudly
// rather than passing on a coincidence.
const incumbentCash: TokenBalance = {
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

function renderCard() {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <BalanceVisibilityProvider>{children}</BalanceVisibilityProvider>
    </QueryClientProvider>
  );
  return render(
    <BalanceCard onOpenFunds={vi.fn()} onOpenWithdraw={vi.fn()} onTakeTour={vi.fn()} />,
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

describe("BalanceCard spendable cash", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client = createQueryClient();
    client.setDefaultOptions({ queries: { ...client.getDefaultOptions().queries, retry: false } });
    session.ready = true;
    session.authenticated = true;
    session.userId = ALICE;
    session.evmAddress = WALLET;
    portfolio.usePortfolio.mockReturnValue({
      tokens: [incumbentCash],
      loading: false,
      refreshing: false,
      error: null,
      refetch: vi.fn(),
    });
    globalBalance.useGlobalBalance.mockReturnValue({ totalUsd: 1234 });
    ramping.usePendingBankDeposit.mockReturnValue({ pending: false });
    apiFetch.mockResolvedValue(answer(balanceBody()));
  });

  afterEach(() => {
    client.clear();
  });

  it("asks the balance endpoint for the signed-in account as soon as it mounts", async () => {
    // The whole complaint: the endpoint had no caller, so nothing appeared in
    // the network tab. This is the assertion that fails the day it goes quiet
    // again.
    renderCard();

    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    expect(String(apiFetch.mock.calls[0][0])).toBe(BALANCE_URL);
    // Authenticated, never anonymous: the gateway scopes this to the token sub.
    expect(apiFetch.mock.calls[0][2]).toEqual({ requireAuth: true });
  });

  it("shows the endpoint's cash rather than the incumbent float sum", async () => {
    // The sample payload holds 0.128718 USDC in the embedded wallet; the
    // stubbed portfolio holds $999 of the same coin. Only one of those can be
    // on screen, and it must be the endpoint's.
    renderCard();

    await waitFor(() =>
      expect(readyToSpendRows()).toEqual(expect.arrayContaining(["$0.13 ready to spend"]))
    );
    expect(readyToSpendRows()).toEqual(["$0.13 ready to spend", "$0.13 ready to spend"]);
    expect(screen.queryByText("$999.00 ready to spend")).toBeNull();
  });

  it("leaves the headline total on the portfolio path", async () => {
    // Only readyToSpend moved. The total still spans six chains and perps,
    // which this endpoint cannot answer for.
    renderCard();

    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    expect(screen.getAllByText("$1234.00").length).toBe(2);
  });

  it("does not hold the withdraw button while the spendable figure is unknown", async () => {
    // The defect this whole change is gated on. An unloaded balance read as 0
    // satisfies `readyToSpend < OFFRAMP_MIN_USDC` silently, and the button
    // shuts on someone who has money and no error to explain it.
    apiFetch.mockResolvedValue(refusal("UNAUTHORIZED", 401));
    ramping.usePendingBankDeposit.mockReturnValue({ pending: true });

    renderCard();

    await waitFor(() =>
      expect(readyToSpendRows()).toEqual([
        "Ready to spend unavailable",
        "Ready to spend unavailable",
      ])
    );
    for (const button of withdrawButtons()) expect(button).toBeEnabled();
  });

  it("still holds the withdraw button on a settling deposit when the cash really is zero", async () => {
    // The hold has to survive the fix, or the fix has traded one defect for
    // another: a wallet with nothing in it and a deposit on its way is exactly
    // what the hold is for.
    apiFetch.mockResolvedValue(answer(emptyBalanceBody()));
    ramping.usePendingBankDeposit.mockReturnValue({ pending: true });

    renderCard();

    await waitFor(() =>
      expect(readyToSpendRows()).toEqual(["$0.00 ready to spend", "$0.00 ready to spend"])
    );
    for (const button of withdrawButtons()) expect(button).toBeDisabled();
  });

  it("renders nothing-held and not-known differently", async () => {
    // "You have nothing" and "we could not load it" are different statements
    // about someone's money, and the card already draws that distinction for
    // the total (see its `errored` branch). Spendable cash now draws it too.
    apiFetch.mockResolvedValue(answer(emptyBalanceBody()));
    const zero = renderCard();
    await waitFor(() =>
      expect(readyToSpendRows()).toEqual(["$0.00 ready to spend", "$0.00 ready to spend"])
    );
    zero.unmount();

    client.clear();
    apiFetch.mockResolvedValue(refusal("UNAUTHORIZED", 401));
    renderCard();

    await waitFor(() =>
      expect(readyToSpendRows()).toEqual([
        "Ready to spend unavailable",
        "Ready to spend unavailable",
      ])
    );
    expect(screen.queryByText("$0.00 ready to spend")).toBeNull();
  });

  it("asks for nothing, and claims nothing, while there is no signed-in account", async () => {
    session.userId = null;
    session.evmAddress = null;
    session.authenticated = false;

    renderCard();

    await waitFor(() => expect(readyToSpendRows().length).toBe(2));
    expect(apiFetch).not.toHaveBeenCalled();
    // Not "$0.00": a card that has not been told whose money it is has not
    // been told there is none.
    expect(readyToSpendRows()).not.toContain("$0.00 ready to spend");
  });
});
