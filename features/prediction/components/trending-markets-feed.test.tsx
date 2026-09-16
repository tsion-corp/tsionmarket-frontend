import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import enMessages from "@/messages/en.json";

// The real catalogue, so a key dropped from messages/*.json fails this suite
// rather than passing it.
const messages = enMessages;

const catalog = vi.hoisted(() => ({
  events: [] as unknown[],
  loading: false,
  unavailable: false,
  error: false,
  loadMoreError: false,
  loadingMore: false,
  hasMore: false,
  loadMore: vi.fn(),
  refetch: vi.fn(),
}));
vi.mock("@/features/prediction/markets/hooks/use-discovery-markets", () => ({
  useDiscoveryEvents: () => catalog,
}));

vi.mock("@/features/prediction/hooks/use-polymarket-access", () => ({
  usePolymarketAccess: () => ({ allowed: true, country: null, loading: false }),
}));

vi.mock("@/features/prediction/house-slip-store", () => ({
  useHouseSlip: () => ({
    selections: [],
    selectedSide: vi.fn(() => null),
    toggle: vi.fn(),
    remove: vi.fn(),
    clear: vi.fn(),
  }),
}));

vi.mock("@/components/ui/currency-select", () => ({
  useMoney: () => ({
    format: (usd: number) => `$${usd}`,
    formatExact: (usd: number) => `$${usd}.00`,
    ready: true,
    currency: { code: "USD", symbol: "$" },
    setCurrency: vi.fn(),
  }),
}));

// The chrome around the list has its own suites. Stubbed so this one is about
// where the positions panel sits.
vi.mock("@/features/prediction/components/prediction-category-nav", () => ({
  PredictionCategoryNav: () => <div data-testid="category-nav" />,
}));
vi.mock("@/features/prediction/components/category-market-shared", () => ({
  CategoryBetSidebar: () => null,
}));

// The positions flow reaches the wallet layer, which has its own suites.
// `loaded` stays false, which is the state a signed-in user lands on: the
// panel shows its Load button and asks the service for nothing until pressed.
const refresh = vi.hoisted(() => vi.fn());
vi.mock("@/features/prediction/hooks/use-polymarket-positions-controller", () => ({
  usePolymarketPositionsController: () => ({
    positions: {
      positions: [],
      available: null,
      cashable: null,
      loading: false,
      loaded: false,
      error: null,
      refresh,
    },
    slip: null,
    setSlip: vi.fn(),
    onRedeem: vi.fn(),
    onSellPosition: vi.fn(),
    onCashOut: vi.fn(),
    redeemingId: null,
    claiming: false,
    selling: false,
    cashingOut: false,
    claimedConditionIds: [],
  }),
}));

import { TrendingMarketsFeed } from "@/features/prediction/components/trending-markets-feed";

function renderFeed() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <TrendingMarketsFeed />
    </NextIntlClientProvider>
  );
}

// The panel was reachable on the old production prediction page and the 2.0
// feed dropped it, so a signed-in user had no way to see an open bet, claim a
// win or cash out. It belongs above the market list: somebody who came to
// check a position should not have to scroll a feed to find it.
describe("TrendingMarketsFeed, the positions panel", () => {
  it("offers Load positions without asking the service for anything", () => {
    renderFeed();
    expect(
      screen.getByRole("button", { name: enMessages.prediction.loadPositions })
    ).toBeInTheDocument();
    // Lazy by construction: mounting the panel must not cost a request.
    expect(refresh).not.toHaveBeenCalled();
  });

  it("puts the panel above the market list", () => {
    const { container } = renderFeed();
    const panel = screen.getByRole("button", { name: enMessages.prediction.loadPositions });
    const markets = container.querySelector("section[aria-label$='markets']");
    expect(markets).not.toBeNull();
    // Node.DOCUMENT_POSITION_FOLLOWING: the list comes after the panel.
    expect(panel.compareDocumentPosition(markets as Node) & 4).toBeTruthy();
  });
});
