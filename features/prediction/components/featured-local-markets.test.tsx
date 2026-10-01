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
    eventId: `event-${id}`,
    title,
    imageUrl: null,
    currency: "USDC",
    minStakeE6: "100000",
    maxStakeE6: "9223372036854775807",
    commissionBps: 3000,
    minOddsE6: "1050000",
    oddsMode: "dynamic_parimutuel",
    state: "active",
    category: title,
    expressForbidden: true,
    hidden: false,
    outcomes: [
      {
        id: `${id}-a`,
        title: "Fighter A",
        odds: "1.50",
        point: null,
        state: "active",
        hidden: false,
      },
      {
        id: `${id}-b`,
        title: "Fighter B",
        odds: "2.30",
        point: null,
        state: "active",
        hidden: false,
      },
    ],
  };
}

function event(
  id: string,
  title: string,
  trendingRank: number,
  primaryMarket: BookBoardMarket,
  secondaryMarket?: BookBoardMarket
): BookBoardEvent {
  return {
    id,
    slug: id,
    title,
    startsAt: Date.now() + 60_000,
    state: "prematch",
    sport: { id: "boxing", slug: "boxing", name: "Boxing", hub: "local" },
    country: { id: "ng", slug: "nigeria", name: "Nigeria" },
    league: { id: "fight-night", slug: "fight-night", name: "Fight Night" },
    trendingRank,
    primaryMarketId: primaryMarket.id,
    participants: [],
    imageUrl: "/assets/images/matchday.png",
    markets: secondaryMarket ? [secondaryMarket, primaryMarket] : [primaryMarket],
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
    const carterPrimary = market("carter-winner", "Fight Winner");
    const carterSecondary = market("carter-distance", "Fight Goes the Distance");
    const phynaPrimary = market("phyna-winner", "Fight Winner");
    mocks.listBookBoard.mockResolvedValue({
      provider: "local",
      environment: "first-party",
      events: [
        event("phyna", "Phyna vs Nkechi Blessing", 2, phynaPrimary),
        event("carter", "Carter Efe vs Speed Darlington", 1, carterPrimary, carterSecondary),
      ],
      limit: 24,
      offset: 0,
      total: 2,
      nextOffset: null,
    });
  });

  it("ranks featured events and exposes only each primary market", async () => {
    renderFeatured();

    const cards = await screen.findAllByRole("article");
    expect(cards).toHaveLength(2);
    expect(within(cards[0]).getByText("Carter Efe vs Speed Darlington")).toBeInTheDocument();
    expect(within(cards[1]).getByText("Phyna vs Nkechi Blessing")).toBeInTheDocument();
    expect(screen.queryByText("Fight Goes the Distance")).not.toBeInTheDocument();
    expect(within(cards[0]).getByText("View all 2")).toBeInTheDocument();
    expect(cards[0].querySelector("img")).toHaveClass("left-0");
    expect(cards[1].querySelector("img")).toHaveClass("right-0");
  });

  it("opens a local ticket for the selected primary outcome", async () => {
    renderFeatured();

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Carter Efe vs Speed Darlington, Fight Winner, Fighter A at 1.50",
      })
    );

    expect(mocks.onPick).toHaveBeenCalledWith(
      expect.objectContaining({
        event: expect.objectContaining({ id: "carter" }),
        market: expect.objectContaining({ id: "carter-winner" }),
        outcome: expect.objectContaining({ id: "carter-winner-a" }),
      })
    );
  });
});
