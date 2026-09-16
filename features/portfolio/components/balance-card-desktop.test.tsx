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
    assetsHeld: "assets",
    breakdownEmpty: "Nothing held yet.",
    slice_cash: "Cash",
    slice_coins: "Coins",
    slice_realAssets: "Real assets",
    slice_tokens: "Tokens",
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

import { BalanceVisibilityProvider } from "@/components/ui/balance-visibility";
import { BalanceCardDesktop } from "@/features/portfolio/components/balance-card-desktop";

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

const aave: TokenBalance = { ...link, symbol: "AAVE", name: "Aave" };

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

function openHoldings() {
  fireEvent.click(screen.getByRole("button", { name: "Your holdings" }));
}

describe("BalanceCardDesktop holdings button", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    portfolio.usePortfolio.mockReturnValue({
      tokens: [link, aave],
      loading: false,
      error: false,
      refetch: vi.fn(),
    });
    render(<BalanceCardDesktop {...view()} />);
  });

  it("sits immediately beside the currency selector", () => {
    const currency = screen.getByTestId("currency-select");
    const holdings = screen.getByRole("button", { name: "Your holdings" });

    // Same row, and the coins circle is the pill's next sibling.
    expect(holdings.parentElement).toBe(currency.parentElement);
    expect(currency.nextElementSibling).toBe(holdings);
  });

  it("does not carry the tour trigger any more", () => {
    // The walkthrough moved to the topbar, beside the language pill. Two
    // controls with the same job on one screen is the bug this replaced.
    expect(screen.queryByRole("button", { name: "Take a tour" })).toBeNull();
    expect(onTakeTour).not.toHaveBeenCalled();
  });

  it("costs the card nothing until it is pressed", () => {
    // The card renders on load. Asking for the holdings list there would put a
    // second portfolio query on the first paint of the dashboard.
    expect(portfolio.usePortfolio).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens the holdings modal, and filters it", () => {
    openHoldings();

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("LINK")).toBeInTheDocument();
    expect(screen.getByText("AAVE")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("searchbox", { name: "Search your holdings" }), {
      target: { value: "chain" },
    });
    expect(screen.getByText("LINK")).toBeInTheDocument();
    expect(screen.queryByText("AAVE")).toBeNull();
  });

  it("hands a held asset to the shared buy and sell sheets", () => {
    openHoldings();
    fireEvent.click(screen.getByText("LINK"));

    expect(appModals.openDetail).toHaveBeenCalledTimes(1);
    const detail = appModals.openDetail.mock.calls[0][0];

    detail.onCta();
    expect(appModals.openBuy).toHaveBeenCalledWith(
      expect.objectContaining({ symbol: "LINK", name: "Chainlink" })
    );

    detail.onCta2();
    expect(appModals.openSell).toHaveBeenCalledWith(
      expect.objectContaining({ rawBalance: "12000000000000000000" })
    );
  });

  it("closes on Escape", () => {
    const trigger = screen.getByRole("button", { name: "Your holdings" });
    openHoldings();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(trigger).toHaveAttribute("aria-expanded", "true");

    fireEvent.keyDown(window, { key: "Escape" });

    // The shell is shut; its content stays in the tree for the length of the
    // slide-out, which no timer in jsdom advances. That the modal actually
    // leaves, and hands focus back, is covered in holdings-modal.test.tsx.
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("gives the modal the wide desktop panel", () => {
    openHoldings();
    // The narrow 440px sheet was the reported defect: the holdings list needs
    // room for a symbol, a network line and a value on one row.
    const panel = screen.getByRole("dialog").closest("[class*='md:w-[']") as HTMLElement;
    expect(panel).not.toBeNull();
    expect(panel.className).toContain("md:w-[min(760px,100%)]");
    // tailwind-merge has to drop the shell's own default, or the two widths
    // race on source order instead of one of them simply winning.
    expect(panel.className).not.toContain("md:w-[min(440px,100%)]");
  });
});

// The allocation ring behind the "Portfolio allocation" row. The reported defect
// was that the chevron rotated smoothly while the panel under it snapped: the
// panel was `{open ? <ring/> : null}`, and an unmount has no close to animate.
describe("BalanceCardDesktop portfolio allocation disclosure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    portfolio.usePortfolio.mockReturnValue({
      tokens: [link, aave],
      loading: false,
      error: false,
      refetch: vi.fn(),
    });
  });

  // The ring masks its own amounts, so it needs the visibility store the rest
  // of the card gets from the app shell.
  function renderCard(over: Partial<BalanceCardViewProps> = {}) {
    return render(
      <BalanceVisibilityProvider>
        <BalanceCardDesktop {...view({ tokens: [link, aave], ...over })} />
      </BalanceVisibilityProvider>
    );
  }

  function trigger() {
    return screen.getByRole("button", { name: /Portfolio allocation/ });
  }

  function panelOf(container: HTMLElement) {
    const id = trigger().getAttribute("aria-controls");
    expect(id).toBeTruthy();
    const panel = container.querySelector(`[id="${id}"]`);
    expect(panel).not.toBeNull();
    return panel as HTMLElement;
  }

  it("keeps the ring mounted while the row is collapsed", () => {
    renderCard();
    expect(trigger()).toHaveAttribute("aria-expanded", "false");
    // Nothing to fold away if the content has already left the tree.
    expect(screen.getByText("Tokens")).toBeInTheDocument();
  });

  it("animates the panel's own height instead of swapping it in and out", () => {
    const { container } = renderCard();
    const panel = panelOf(container);

    expect(panel.className).toContain("[grid-template-rows:0fr]");
    expect(panel.className).toContain("transition-[grid-template-rows,opacity]");
    // Collapsed content stays out of the tab order and unread, the way the
    // unmounted panel was.
    expect(panel.hasAttribute("inert")).toBe(true);

    fireEvent.click(trigger());

    expect(trigger()).toHaveAttribute("aria-expanded", "true");
    expect(panel.className).toContain("[grid-template-rows:1fr]");
    expect(panel.hasAttribute("inert")).toBe(false);
  });

  it("keeps the panel full width and puts its top gap on the ring, not the panel", () => {
    // Two layout traps, both measured in a browser at 1440px.
    // The panel's box is a flex item in an items-center column, so without a
    // full-width parent it shrinks to the ring's own width and the legend
    // beside it loses the room it stretches into.
    // And the 16px gap has to sit on the ring inside the clip. A margin on
    // either the panel or the clip counts towards the collapsed track, which
    // then stands 16px tall while shut and leaves dead space under the row.
    const { container } = renderCard();
    const panel = panelOf(container);

    expect(panel.parentElement?.className).toContain("w-full");
    expect(panel.className).not.toContain("mt-");

    const clip = panel.querySelector(".overflow-hidden") as HTMLElement;
    expect(clip).not.toBeNull();
    expect(clip.className).not.toContain("mt-");
    expect((clip.firstElementChild as HTMLElement).className).toContain("mt-4");
  });

  it("still draws no allocation row at all when nothing is held", () => {
    renderCard({ tokens: [] });
    expect(screen.queryByRole("button", { name: /Portfolio allocation/ })).toBeNull();
    expect(screen.queryByText("Tokens")).toBeNull();
  });
});
