import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { BookBoardEvent, BookBoardMarket } from "@/features/prediction/book/api";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/hooks/use-auth-session", () => ({
  useAuthSession: () => ({ ready: true, authenticated: false, evmAddress: null }),
}));

import { EventRow } from "./book-sportsbook-view";

// The words on a row are what tell a person which bet they are placing. On a
// phone the row was split 46/54 and every one of them was `truncate`d: the
// market question, the fight, the fighters and the outcome labels above the
// odds ("Carter Efe by K…", "Completes all …"). None may be cut now.
const market: BookBoardMarket = {
  id: "m1",
  eventId: "e1",
  title: "Carter Efe wins by knockout in the first three rounds",
  imageUrl: null,
  currency: "USDC",
  minStakeE6: "1000000",
  maxStakeE6: "100000000",
  commissionBps: 0,
  minOddsE6: "1000000",
  oddsMode: "dynamic_parimutuel",
  state: "active",
  category: null,
  expressForbidden: false,
  hidden: false,
  outcomes: [
    {
      id: "o1",
      title: "Carter Efe by KO, TKO or DQ",
      odds: "1.050",
      point: null,
      state: "active",
      hidden: false,
    },
    {
      id: "o2",
      title: "Carter Efe does not win inside the distance",
      odds: "1.050",
      point: null,
      state: "active",
      hidden: false,
    },
  ],
};

const event: BookBoardEvent = {
  id: "e1",
  slug: "carter-efe-vs-speed-darlington",
  title: "Carter Efe vs Speed Darlington",
  startsAt: Date.UTC(2026, 9, 1, 21, 0),
  state: "active",
  sport: { id: "s1", slug: "boxing", name: "Boxing", hub: "sports" },
  country: { id: null, slug: "nigeria", name: "Nigeria" },
  league: { id: null, slug: "celebrity-boxing", name: "Celebrity Boxing" },
  trendingRank: null,
  primaryMarketId: "m1",
  participants: [
    { name: "Carter Efe", imageUrl: null },
    { name: "Speed Darlington", imageUrl: null },
  ],
  imageUrl: null,
  markets: [market],
};

function renderRow() {
  return render(<EventRow event={event} market={market} pick={null} onPick={vi.fn()} />);
}

function truncated(el: HTMLElement): boolean {
  let node: HTMLElement | null = el;
  while (node && node.tagName !== "ARTICLE") {
    if (/\btruncate\b|\bwhitespace-nowrap\b|\bline-clamp-1\b/.test(node.className)) return true;
    node = node.parentElement;
  }
  return false;
}

describe("sportsbook event row", () => {
  it("never cuts the market question, the fight, the fighters or the outcome labels", () => {
    renderRow();
    const texts = [
      market.title,
      event.title,
      ...event.participants.map((p) => p.name),
      ...market.outcomes.map((o) => o.title),
    ];
    for (const text of texts) {
      for (const el of screen.getAllByText(text)) {
        expect(truncated(el), `"${text}" is truncated`).toBe(false);
      }
    }
  });

  it("puts each outcome's label inside its own button, above the odds", () => {
    renderRow();
    for (const outcome of market.outcomes) {
      const button = screen.getByRole("button", {
        name: new RegExp(outcome.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
      });
      expect(within(button).getByText(outcome.title)).toBeInTheDocument();
      expect(within(button).getByText(outcome.odds)).toBeInTheDocument();
    }
  });

  it("stacks on a phone and keeps the two-column desk from 1280px", () => {
    const { container } = renderRow();
    const grid = container.querySelector("article > div") as HTMLElement;
    expect(grid.className).toContain("grid-cols-1");
    expect(grid.className).toContain("min-[1280px]:grid-cols-[minmax(0,1fr)_28rem]");
  });
});
