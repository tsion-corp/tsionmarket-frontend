import { fireEvent, render as rtlRender, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import enMessages from "@/messages/en.json";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DiscoveryMarketEvent, DiscoveryMarketSummary } from "../markets/api";
import { PREDICTION_CATEGORIES, predictionCategoryHref } from "../categories";
import { PredictionView } from "./prediction-view";

// The panel reads its labels from the real catalogue, so every render — and
// every rerender — needs the provider around it.
function render(ui: React.ReactElement) {
  const wrap = (node: React.ReactElement) => (
    <NextIntlClientProvider locale="en" messages={enMessages}>
      {node}
    </NextIntlClientProvider>
  );
  const view = rtlRender(wrap(ui));
  return { ...view, rerender: (next: React.ReactElement) => view.rerender(wrap(next)) };
}

const mocks = vi.hoisted(() => ({
  catalog: vi.fn(),
  toggle: vi.fn(),
  remove: vi.fn(),
  clear: vi.fn(),
}));

vi.mock("../markets/hooks/use-discovery-markets", () => ({
  useDiscoveryEvents: mocks.catalog,
}));
vi.mock("../hooks/use-polymarket-access", () => ({
  usePolymarketAccess: () => ({ allowed: true }),
}));
vi.mock("../house-slip-store", () => ({
  useHouseSlip: () => ({
    selections: [],
    toggle: mocks.toggle,
    remove: mocks.remove,
    clear: mocks.clear,
    selectedSide: () => undefined,
  }),
}));
vi.mock("./category-bet-sidebar", () => ({
  CategoryBetSidebar: () => null,
}));

// The positions panel now sits above the list on every discovery feed. It
// reaches the wallet layer, which has its own suites, so it is stood in here:
// these suites are about the market list, not the money path.
vi.mock("../hooks/use-polymarket-positions-controller", () => ({
  usePolymarketPositionsController: () => ({
    positions: {
      positions: [],
      available: null,
      cashable: null,
      loading: false,
      loaded: false,
      error: null,
      refresh: vi.fn(),
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
vi.mock("@/components/ui/currency-select", () => ({
  useMoney: () => ({
    format: (usd: number) => `$${usd}`,
    formatExact: (usd: number) => `$${usd}.00`,
    ready: true,
    currency: { code: "USD", symbol: "$" },
    setCurrency: vi.fn(),
  }),
}));

function market(id: string, question: string): DiscoveryMarketSummary {
  return {
    id,
    conditionId: `condition-${id}`,
    slug: id,
    question,
    groupItemTitle: null,
    description: null,
    category: null,
    imageUrl: null,
    iconUrl: null,
    startDate: null,
    endDate: null,
    active: true,
    closed: false,
    acceptingOrders: true,
    restricted: false,
    enableOrderBook: true,
    outcomes: [
      { name: "Yes", tokenId: `yes-${id}`, referencePrice: 0.95, decimalOdds: 1.05 },
      { name: "No", tokenId: `no-${id}`, referencePrice: 0.05, decimalOdds: 20 },
    ],
    liquidity: 500,
    volume: 10_000,
    volume24h: 1_000,
    bestBid: null,
    bestAsk: null,
    lastTradePrice: null,
    spread: null,
    oneDayPriceChange: null,
    negRisk: false,
    rfqEnabled: false,
  };
}

function discoveryEvent(
  id: string,
  title: string,
  tag: { label: string; slug: string },
  volume24h: number
): DiscoveryMarketEvent {
  return {
    id,
    slug: id,
    title,
    description: null,
    imageUrl: null,
    iconUrl: null,
    startDate: null,
    endDate: null,
    active: true,
    closed: false,
    restricted: false,
    liquidity: 500,
    volume: 10_000,
    volume24h,
    oneDayPriceChange: null,
    marketCount: 1,
    markets: [market(`market-${id}`, title)],
    tags: [{ id: `tag-${id}`, ...tag }],
  };
}

const politicsEvent = discoveryEvent(
  "politics-event",
  "Will the Senate pass the bill?",
  { label: "Politics", slug: "politics" },
  25_000
);
const bitcoinEvent = discoveryEvent(
  "bitcoin-event",
  "Will Bitcoin close above $80,000?",
  { label: "Bitcoin", slug: "bitcoin" },
  50_000
);

describe("PredictionView", () => {
  beforeEach(() => {
    mocks.catalog.mockReturnValue({
      events: [politicsEvent, bitcoinEvent],
      loading: false,
      error: false,
      hasMore: false,
      loadingMore: false,
      loadMoreError: false,
      loadMore: vi.fn(),
      refetch: vi.fn(),
    });
  });

  it("renders the Polymarket feed filters backed by discovery sorts", () => {
    render(<PredictionView />);

    const navigation = screen.getByRole("navigation", { name: "Prediction feeds" });
    const links = Array.from(navigation.querySelectorAll("a"));

    expect(links.map((link) => link.textContent)).toEqual([
      "Trending",
      "Breaking",
      "New",
      ...PREDICTION_CATEGORIES.filter(({ key }) => key !== "trending").map(({ label }) => label),
    ]);
    expect(screen.getByRole("link", { name: "Trending" })).toHaveAttribute("href", "/prediction");
    expect(screen.getByRole("link", { name: "Breaking" })).toHaveAttribute(
      "href",
      "/prediction/markets?category=trending&sort=ending_soon"
    );
    expect(screen.getByRole("link", { name: "New" })).toHaveAttribute(
      "href",
      "/prediction/markets?category=trending&sort=newest"
    );
    for (const category of PREDICTION_CATEGORIES.filter(({ key }) => key !== "trending")) {
      expect(screen.getByRole("link", { name: category.label })).toHaveAttribute(
        "href",
        predictionCategoryHref(category.key)
      );
    }
    expect(mocks.catalog).toHaveBeenCalledWith("trending", "volume_24h", {
      limit: 20,
      marketLimit: 2,
    });
  });

  it("builds Trending filters from backend tags and filters the live event rows", () => {
    render(<PredictionView />);

    const filters = screen.getByLabelText("Trending market filters");
    expect(
      within(filters)
        .getAllByRole("button")
        .map((button) => button.textContent)
    ).toEqual(["All", "Bitcoin", "Politics"]);
    expect(screen.getAllByRole("article")).toHaveLength(2);
    expect(
      screen.getByRole("link", { name: "Open Will the Senate pass the bill? details" })
    ).toHaveAttribute("href", "/prediction/event/politics-event?source=markets&category=trending");

    fireEvent.click(within(filters).getByRole("button", { name: "Politics" }));
    expect(screen.getAllByRole("article")).toHaveLength(1);
    expect(screen.getByText("Will the Senate pass the bill?")).toBeInTheDocument();
    expect(screen.queryByText("Will Bitcoin close above $80,000?")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByText("Trending markets")).not.toBeInTheDocument();
    expect(screen.queryByText("Live markets ranked by backend data")).not.toBeInTheDocument();
    expect(screen.queryByText(/^Volume$/)).not.toBeInTheDocument();
  });

  it("does not restore the retired prediction landing content", () => {
    render(<PredictionView />);

    expect(screen.queryByText("Global")).not.toBeInTheDocument();
    expect(screen.queryByText("Local")).not.toBeInTheDocument();
    expect(screen.queryByText("Explore all markets")).not.toBeInTheDocument();
  });

  // "Your positions" was retired with the rest of the old landing content when
  // the 2.0 feed landed, and this suite locked that in. It came back on
  // 2026-09-16: with the feed as the whole page, a signed-in user had no way
  // to reach an open bet, claim a win or cash out, which is what people were
  // reporting. The rest of the retired landing stays retired.
  it("offers the positions panel above the market list", () => {
    render(<PredictionView />);

    expect(screen.getByText("Your positions")).toBeInTheDocument();
    const panel = screen.getByRole("button", {
      name: enMessages.prediction.loadPositions,
    });
    const markets = document.querySelector("section[aria-label$='markets']");
    expect(markets).not.toBeNull();
    expect(panel.compareDocumentPosition(markets as Node) & 4).toBeTruthy();
  });
});
