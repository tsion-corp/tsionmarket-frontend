import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DiscoveryMarketEvent, DiscoveryMarketSummary } from "../markets/api";
import { CategoryMarketsShell } from "./politics-markets-shell";

const mocks = vi.hoisted(() => ({ catalog: vi.fn() }));

// The Shine switch is the account's own preference behind a React Query read
// and a Privy session. What matters here is that this page carries one, and
// for which service, so it stands in as a marker naming the service it decides.
vi.mock("@/components/shine/shine-toggle", () => ({
  ShineToggle: ({ service }: { service: string }) => (
    <div data-testid="shine-toggle">{service}</div>
  ),
}));

vi.mock("../markets/hooks/use-discovery-markets", () => ({
  useDiscoveryEvents: mocks.catalog,
}));
vi.mock("../hooks/use-polymarket-access", () => ({
  usePolymarketAccess: () => ({ allowed: true }),
}));
// Signed out, through the Decane-backed session seam; "login" is now a route
// to /auth, so the router is stubbed rather than a Privy login callback.
vi.mock("@/hooks/use-auth-session", () => ({
  useAuthSession: () => ({
    ready: true,
    authenticated: false,
    evmAddress: null,
    solanaAddress: null,
    profile: { name: "Account", email: "", avatarSeed: "worldstreet" },
    logout: vi.fn(),
  }),
}));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("../house-slip-store", () => ({
  useHouseSlip: () => ({
    selections: [],
    toggle: vi.fn(),
    remove: vi.fn(),
    clear: vi.fn(),
    selectedSide: () => undefined,
  }),
}));
vi.mock("./category-bet-sidebar", () => ({
  CategoryBetSidebar: () => null,
}));

export function market(id: string, title: string): DiscoveryMarketSummary {
  return {
    id,
    conditionId: `condition-${id}`,
    slug: title,
    question: `Will ${title} win?`,
    groupItemTitle: title,
    description: null,
    category: "politics",
    imageUrl: null,
    iconUrl: null,
    startDate: null,
    endDate: null,
    active: true,
    closed: false,
    acceptingOrders: true,
    restricted: false,
    enableOrderBook: true,
    liquidity: 100,
    volume: 200,
    volume24h: 20,
    bestBid: null,
    bestAsk: null,
    lastTradePrice: null,
    spread: null,
    oneDayPriceChange: null,
    negRisk: false,
    rfqEnabled: false,
    outcomes: [
      { name: "Yes", tokenId: `yes-${id}`, referencePrice: 0.05, decimalOdds: 20 },
      { name: "No", tokenId: `no-${id}`, referencePrice: 0.95, decimalOdds: 1.05 },
    ],
  };
}

export const election: DiscoveryMarketEvent = {
  id: "101",
  slug: "presidential-election",
  title: "Presidential election",
  description: "Election rules",
  imageUrl: null,
  iconUrl: null,
  startDate: null,
  endDate: null,
  active: true,
  closed: false,
  restricted: false,
  liquidity: 500,
  volume: 1000,
  volume24h: 100,
  oneDayPriceChange: null,
  marketCount: 41,
  markets: [market("1", "Alice"), market("2", "Bob"), market("3", "Carol")],
  tags: [{ id: "1", label: "Elections", slug: "elections" }],
};

const policy: DiscoveryMarketEvent = {
  ...election,
  id: "102",
  slug: "senate-bill",
  title: "Senate bill",
  volume24h: 50,
  tags: [{ id: "2", label: "Policy", slug: "policy" }],
};

describe("category event listing", () => {
  beforeEach(() => {
    mocks.catalog.mockReturnValue({
      events: [election, policy],
      loading: false,
      unavailable: false,
      error: false,
      hasMore: false,
      loadingMore: false,
      loadMoreError: false,
      loadMore: vi.fn(),
      refetch: vi.fn(),
    });
  });

  it("uses the shared black feed and opens an in-app category detail", () => {
    render(<CategoryMarketsShell category="politics" />);

    expect(screen.getByRole("link", { name: "Politics" })).toHaveAttribute("aria-current", "page");
    expect(screen.getAllByRole("article")).toHaveLength(2);
    expect(
      screen.getByRole("link", { name: /open presidential election details/i })
    ).toHaveAttribute("href", "/prediction/event/101?source=markets&category=politics");
    expect(screen.getAllByRole("button", { name: "Yes 20.00" })[0]).toBeEnabled();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByText(/^Volume$/)).not.toBeInTheDocument();
    expect(mocks.catalog).toHaveBeenCalledWith("politics", "volume_24h", {
      limit: 20,
      marketLimit: 2,
    });
  });

  it("builds category filters from backend tags", () => {
    render(<CategoryMarketsShell category="politics" />);

    const filters = screen.getByLabelText("Politics market filters");
    expect(
      within(filters)
        .getAllByRole("button")
        .map((button) => button.textContent)
    ).toEqual(["All", "Elections", "Policy"]);

    fireEvent.click(within(filters).getByRole("button", { name: "Elections" }));
    expect(screen.getAllByRole("article")).toHaveLength(1);
    expect(screen.getByText(/Presidential election/)).toBeInTheDocument();
    expect(screen.queryByText("Senate bill")).not.toBeInTheDocument();
  });

  it("passes Breaking and New sorting to the backend", () => {
    const { rerender } = render(<CategoryMarketsShell category="trending" sort="ending_soon" />);
    expect(screen.getByRole("link", { name: "Breaking" })).toHaveAttribute("aria-current", "page");
    expect(mocks.catalog).toHaveBeenLastCalledWith("trending", "ending_soon", {
      limit: 20,
      marketLimit: 2,
    });

    rerender(<CategoryMarketsShell category="trending" sort="newest" />);
    expect(screen.getByRole("link", { name: "New" })).toHaveAttribute("aria-current", "page");
    expect(mocks.catalog).toHaveBeenLastCalledWith("trending", "newest", {
      limit: 20,
      marketLimit: 2,
    });
  });

  it("keeps the shell stable and explains a slow market connection", () => {
    const refetch = vi.fn();
    mocks.catalog.mockReturnValue({
      events: [],
      loading: false,
      unavailable: true,
      error: false,
      hasMore: false,
      loadingMore: false,
      loadMoreError: false,
      loadMore: vi.fn(),
      refetch,
    });

    render(<CategoryMarketsShell category="crypto" />);

    expect(screen.getByRole("link", { name: "Crypto" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("status")).toHaveTextContent("Your connection is slow");
    expect(screen.queryByText("No markets match these filters.")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(refetch).toHaveBeenCalledOnce();
  });
});
