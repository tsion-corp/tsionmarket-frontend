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
  it("deals the chess room first, then Last Man, the square, Checkers and ArkBall", () => {
    render(<ConversationRow />, { wrapper });
    expect(realSlideHeadlines()).toEqual([
      enMessages.discovery.conversationHeadline,
      enMessages.discovery.lastManIdleHeadline,
      enMessages.discovery.squareIdleHeadline,
      enMessages.discovery.checkersIdleHeadline,
      enMessages.discovery.arkballHeadline,
    ]);
  });

  it("sends the heading to Market Square in a new tab", () => {
    render(<ConversationRow />, { wrapper });
    const heading = screen.getByRole("link", { name: enMessages.discovery.conversationTitle });
    expect(heading).toHaveAttribute("href", "https://square.example");
    expect(heading).toHaveAttribute("target", "_blank");
  });

  it("puts the richest open round on the Last Man card", () => {
    const soon = Math.floor(Date.now() / 1000) + 3600;
    useDashboardFeed.mockReturnValue({
      data: feed({
        rounds: [
          { gameId: 7, endTime: soon, potUsd: 100, pot: "$100" },
          { gameId: 9, endTime: soon, potUsd: 900, pot: "$900" },
          { gameId: 11, endTime: 1, potUsd: 9000, pot: "$9,000" },
        ],
        chess: [],
        checkers: [{ id: "a" }, { id: "b" }],
      }),
    });
    render(<ConversationRow />, { wrapper });
    const joins = screen.getAllByRole("link", { name: /Join the round/ });
    for (const join of joins) expect(join).toHaveAttribute("href", "/casino/last-standing/9");
    expect(screen.getAllByText("2 matches being played right now").length).toBeGreaterThan(0);
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
