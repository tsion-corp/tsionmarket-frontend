import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TokenBalance } from "@/hooks/use-portfolio";
import type { BalanceCardViewProps } from "@/features/portfolio/components/balance-card-view";

// Real English rather than echoed keys, so the accessible names asserted below
// are the ones a user reads. An unknown key still surfaces as its path.
const MESSAGES: Record<string, Record<string, string>> = {
  balance: {
    totalBalance: "Total balance",
    showBalance: "Show balance",
    hideBalance: "Hide balance",
    readyToSpend: "Ready to spend",
    addFunds: "Add funds",
    withdraw: "Withdraw",
    couldntLoad: "Couldn't load",
    portfolioAllocation: "Portfolio allocation",
    depositPending: "Your deposit is settling.",
  },
  tour: { replayCta: "Take a tour" },
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
  useTranslations: (namespace: string) => (key: string) =>
    MESSAGES[namespace]?.[key] ?? `${namespace}.${key}`,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

// The currency layer is a store plus a live FX query. The card is under test for
// where the holdings trigger sits, not for the picker's own behaviour, so the
// pill is stubbed to something the test can find by name.
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

// The shared sheet stack. Stubbed at the seam so the test can see which sheet
// the card asked for without mounting the whole trade bundle.
const appModals = vi.hoisted(() => ({
  openDetail: vi.fn(),
  openBuy: vi.fn(),
  openSell: vi.fn(),
  openRwaTrade: vi.fn(),
  openMemeSell: vi.fn(),
  openFunds: vi.fn(),
  close: vi.fn(),
  showDone: vi.fn(),
}));
vi.mock("@/components/layout/modals/app-modals", () => ({
  useAppModals: () => ({ modal: null, ...appModals }),
  AppModalHost: () => null,
}));

const portfolio = vi.hoisted(() => ({ usePortfolio: vi.fn() }));
vi.mock("@/hooks/use-portfolio", () => portfolio);

import { BalanceCardMobile } from "@/features/portfolio/components/balance-card-mobile";

const link: TokenBalance = {
  symbol: "LINK",
  name: "Chainlink",
  network: "eth-mainnet",
  address: "0x514910771af9ca656af840dff83e8264ecf986ca",
  decimals: 18,
  kind: "token",
  balance: 12,
  rawBalance: "12000000000000000000",
  priceUsd: 20,
  valueUsd: 240,
  logo: null,
};

const onTakeTour = vi.fn();

function view(over: Partial<BalanceCardViewProps> = {}): BalanceCardViewProps {
  return {
    totalUsd: 1234,
    readyToSpend: 100,
    tokens: [],
    loading: false,
    refreshing: false,
    errored: false,
    depositPending: false,
    withdrawHeld: false,
    hidden: false,
    onToggleHidden: vi.fn(),
    formatMasked: (amount: number) => `$${amount.toFixed(2)}`,
    onOpenFunds: vi.fn(),
    onOpenWithdraw: vi.fn(),
    onTakeTour,
    ...over,
  };
}

// The phone card carries the same coins button as the desktop card, in the
// comp's place beside the currency pill, opening the same holdings list. It
// replaced a question mark that opened the walkthrough.
describe("BalanceCardMobile holdings button", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    portfolio.usePortfolio.mockReturnValue({
      tokens: [link],
      loading: false,
      error: false,
      refetch: vi.fn(),
    });
    render(<BalanceCardMobile {...view()} />);
  });

  it("sits beside the currency selector, and the tour trigger is gone", () => {
    const currency = screen.getByTestId("currency-select");
    const holdings = screen.getByRole("button", { name: "Your holdings" });
    expect(currency.nextElementSibling).toBe(holdings);
    expect(screen.queryByRole("button", { name: "Take a tour" })).toBeNull();
  });

  it("costs the card nothing until it is pressed", () => {
    expect(portfolio.usePortfolio).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens the holdings modal with the wallet's assets", () => {
    const trigger = screen.getByRole("button", { name: "Your holdings" });
    fireEvent.click(trigger);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("LINK")).toBeInTheDocument();
    expect(trigger).toHaveAttribute("aria-expanded", "true");
  });

  it("hands a held asset to the shared detail sheet", () => {
    fireEvent.click(screen.getByRole("button", { name: "Your holdings" }));
    fireEvent.click(screen.getByText("LINK"));
    expect(appModals.openDetail).toHaveBeenCalledTimes(1);
  });
});
