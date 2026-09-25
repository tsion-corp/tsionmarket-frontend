import type { ReactNode } from "react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import enMessages from "@/messages/en.json";
import type { DashboardFeed } from "@/lib/dashboard-feed";

const useDashboardFeed = vi.fn();
vi.mock("@/hooks/use-dashboard-feed", () => ({ useDashboardFeed: () => useDashboardFeed() }));

const { ArkadeRow } = await import("@/features/discovery/components/arkade-row");

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
  useDashboardFeed.mockReturnValue({ data: undefined });
});

// The carousel clones its slides to loop, so a card's copy appears more than
// once. The order below is read off the real slides, which are the ones that
// are not marked inert.
function realSlideHeadlines(): string[] {
  return Array.from(document.querySelectorAll("article"))
    .filter((card) => card.closest("[inert]") === null)
    .map((card) => card.querySelector("h3")?.textContent ?? "");
}

describe("Arkade row", () => {
  it("deals one card per game, in the Arkade's own order", () => {
    render(<ArkadeRow />, { wrapper });
    expect(realSlideHeadlines()).toEqual([
      // The Last Man card is the event's poster, so what stands where the
      // other cards put a headline is its wordmark.
      `${enMessages.discovery.lastManMarathonLead} ${enMessages.discovery.lastManMarathonTitle}`,
      enMessages.discovery.chessHeadline,
      enMessages.discovery.arkballHeadline,
      enMessages.discovery.checkersIdleHeadline,
      enMessages.discovery.arkjetHeadline,
      enMessages.discovery.chickenHeadline,
    ]);
  });

  it("sends the heading to the Arkade itself", () => {
    render(<ArkadeRow />, { wrapper });
    expect(screen.getByRole("link", { name: /Play the Arkade/ })).toHaveAttribute(
      "href",
      "/casino"
    );
  });

  it("puts the richest open round on the Last Man card, and counts the live matches", () => {
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
    render(<ArkadeRow />, { wrapper });
    const joins = screen.getAllByRole("link", { name: /Join Now/ });
    for (const join of joins) expect(join).toHaveAttribute("href", "/casino/last-standing/9");
    expect(screen.getAllByText("2 matches being played right now").length).toBeGreaterThan(0);
  });
});
