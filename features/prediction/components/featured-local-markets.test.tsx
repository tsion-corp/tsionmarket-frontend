import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BookBoardEvent, BookBoardMarket } from "@/features/prediction/book/api";
import { FeaturedLocalMarkets } from "./featured-local-markets";

const mocks = vi.hoisted(() => ({
  listBookBoard: vi.fn(),
  onPick: vi.fn(),
}));

vi.mock("@/features/prediction/book/api", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/features/prediction/book/api")>();
  return { ...original, listBookBoard: mocks.listBookBoard };
});

function market(id: string, title: string): BookBoardMarket {
  return {
    id,
    eventId: "event-1",
    title,
    imageUrl: `https://images.example/${id}.jpg`,
    currency: "USDC",
    minStakeE6: "100000",
    maxStakeE6: "9223372036854775807",
    commissionBps: 3000,
    minOddsE6: "1050000",
    oddsMode: "dynamic_parimutuel",
    state: "active",
    category: "Winner",
    expressForbidden: true,
    hidden: false,
    outcomes: [
      { id: `${id}-yes`, title: "Yes", odds: "1.05", point: null, state: "active", hidden: false },
      { id: `${id}-no`, title: "No", odds: "1.05", point: null, state: "active", hidden: false },
    ],
  };
}

function event(markets: BookBoardMarket[]): BookBoardEvent {
  return {
    id: "event-1",
    slug: "bbnaija-finale",
    title: "BBNaija Season 11 Finale",
    startsAt: Date.now() + 60_000,
    state: "prematch",
    sport: { id: "entertainment", slug: "entertainment", name: "Entertainment", hub: "local" },
    country: { id: "ng", slug: "nigeria", name: "Nigeria" },
    league: { id: "bbnaija", slug: "big-brother-naija", name: "Big Brother Naija" },
    trendingRank: 1,
    primaryMarketId: null,
    participants: [],
    imageUrl: "https://images.example/event.jpg",
    markets,
  };
}

function renderFeatured() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <FeaturedLocalMarkets pick={null} onPick={mocks.onPick} />
    </QueryClientProvider>
  );
}

describe("FeaturedLocalMarkets", () => {
  beforeEach(() => {
    mocks.onPick.mockReset();
    mocks.listBookBoard.mockResolvedValue({
      provider: "local",
      environment: "first-party",
      events: [event([market("aikou", "Will Aikou win?"), market("temi", "Will Temi win?")])],
      limit: 24,
      offset: 0,
      total: 1,
      nextOffset: null,
    });
  });

  it("renders every active market as its own scrolling card", async () => {
    const { container } = renderFeatured();

    const cards = await screen.findAllByRole("article");
    expect(cards).toHaveLength(2);
    expect(within(cards[0]).getByText("Will Aikou win?")).toBeInTheDocument();
    expect(within(cards[1]).getByText("Will Temi win?")).toBeInTheDocument();
    expect(container.querySelector(".overflow-x-auto")).not.toBeNull();
  });

  it("opens the local ticket for the selected outcome", async () => {
    renderFeatured();

    fireEvent.click(
      await screen.findByRole("button", {
        name: "BBNaija Season 11 Finale, Will Aikou win?, Yes at 1.05",
      })
    );

    expect(mocks.onPick).toHaveBeenCalledWith(
      expect.objectContaining({
        market: expect.objectContaining({ id: "aikou" }),
        outcome: expect.objectContaining({ id: "aikou-yes" }),
      })
    );
  });
});
