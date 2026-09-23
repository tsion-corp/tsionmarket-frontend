import type { ReactNode } from "react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import enMessages from "@/messages/en.json";
import type { DashboardFeed } from "@/lib/dashboard-feed";
import type { LiveConversation } from "@/features/discovery/hooks/use-live-conversations";

const useDashboardFeed = vi.fn();
vi.mock("@/hooks/use-dashboard-feed", () => ({ useDashboardFeed: () => useDashboardFeed() }));

const useLiveConversations = vi.fn<() => readonly LiveConversation[]>();
vi.mock("@/features/discovery/hooks/use-live-conversations", () => ({
  useLiveConversations: () => useLiveConversations(),
}));

vi.mock("@/lib/market-square", () => ({
  MARKET_SQUARE_HIDDEN: false,
  marketSquareHref: (path?: string) =>
    path ? `https://square.example/${path}` : "https://square.example",
}));

const { ConversationRow } = await import("@/features/discovery/components/conversation-row");

beforeAll(() => {
  if (typeof window.matchMedia !== "function") {
    window.matchMedia = (query: string) =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as MediaQueryList;
  }
  if (typeof globalThis.ResizeObserver !== "function") {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
});

function wrapper({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider locale="en" messages={enMessages}>
      {children}
    </NextIntlClientProvider>
  );
}

const feed = (live: DashboardFeed["live"]): DashboardFeed => ({
  asOf: Date.now(),
  spot: null,
  perps: null,
  memes: null,
  rwa: null,
  live,
});

beforeEach(() => {
  useDashboardFeed.mockReset();
  useLiveConversations.mockReset();
  useDashboardFeed.mockReturnValue({ data: undefined });
  useLiveConversations.mockReturnValue([]);
});

// The carousel clones its slides to loop, so a card's copy appears more than
// once. The order below is read off the real slides, which are the ones that
// are not marked inert.
function realSlideHeadlines(): string[] {
  return Array.from(document.querySelectorAll("article"))
    .filter((card) => card.closest("[inert]") === null)
    .map((card) => card.querySelector("h3")?.textContent ?? "");
}

describe("conversation row", () => {
  // The band is Square and nothing else: the rooms that are live, the way into
  // one of your own, and the feed. The Arkade's games have their own shelf.
  it("deals the rooms, going live and the feed", () => {
    render(<ConversationRow />, { wrapper });
    expect(realSlideHeadlines()).toEqual([
      enMessages.discovery.squareIdleHeadline,
      enMessages.discovery.goLiveHeadline,
      enMessages.discovery.feedHeadline,
    ]);
  });

  // The band used to lead with a chess room card that no caller ever supplied
  // with a real room, so it always showed a fixed headline behind a pill to
  // /casino/chess/watch, which does not resolve. It is gone, and no pill in
  // the band points into the chess route any more.
  it("carries no chess room card and no way into the broken chess route", () => {
    render(<ConversationRow />, { wrapper });
    expect(screen.queryByText(enMessages.discovery.conversationHeadline)).toBeNull();
    const chessBound = screen
      .getAllByRole("link")
      .filter((link) => link.getAttribute("href")?.includes("/casino/chess"));
    expect(chessBound).toEqual([]);
  });

  it("carries no Arkade game, which is the other shelf's job", () => {
    render(<ConversationRow />, { wrapper });
    expect(screen.queryByText(enMessages.discovery.checkersIdleHeadline)).toBeNull();
    expect(screen.queryByText(enMessages.discovery.arkballHeadline)).toBeNull();
    expect(screen.queryByRole("link", { name: /Join Now/ })).toBeNull();
  });

  it("sends the heading to Market Square, in the same tab", () => {
    render(<ConversationRow />, { wrapper });
    const heading = screen.getByRole("link", { name: enMessages.discovery.conversationTitle });
    expect(heading).toHaveAttribute("href", "https://square.example");
    expect(heading).not.toHaveAttribute("target");
  });

  // Two of the square's cards only OPEN the square, so they open its page in
  // this app. The one that does something, starting a room, still leaves.
  it("sends the feed and the idle rooms card to the Square page, and Go live out", () => {
    render(<ConversationRow />, { wrapper });
    for (const name of [/Open the feed/, /Open Square/]) {
      const pill = screen.getAllByRole("link", { name })[0];
      expect(pill).toHaveAttribute("href", "/square");
      expect(pill).not.toHaveAttribute("target");
    }
    const start = screen.getAllByRole("link", { name: /Start a room/ })[0];
    expect(start).toHaveAttribute("href", "https://square.example");
    expect(start).toHaveAttribute("target", "_blank");
  });

  it("puts the live room on the square card", () => {
    useLiveConversations.mockReturnValue([
      {
        id: "r1",
        title: "Base season, who wins",
        host: "Ada",
        avatars: [],
        href: "https://square.example/live/r1",
      },
    ]);
    render(<ConversationRow />, { wrapper });
    expect(screen.getAllByText("Base season, who wins").length).toBeGreaterThan(0);
  });
});

// The square's cards are the only cards the band has now, so a hidden square
// leaves nothing to deal. The band must go rather than render a heading over
// an empty rail.
describe("conversation row with the square hidden", () => {
  it("renders nothing at all", async () => {
    vi.resetModules();
    vi.doMock("@/lib/market-square", () => ({
      MARKET_SQUARE_HIDDEN: true,
      marketSquareHref: () => null,
    }));
    const { ConversationRow: Hidden } =
      await import("@/features/discovery/components/conversation-row");

    const { container } = render(<Hidden />, { wrapper });

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText(enMessages.discovery.conversationTitle)).toBeNull();
  });
});
