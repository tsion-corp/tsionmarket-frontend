import type { ReactNode } from "react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import enMessages from "@/messages/en.json";
import type { DashboardFeed } from "@/lib/dashboard-feed";

const useDashboardFeed = vi.fn();
vi.mock("@/hooks/use-dashboard-feed", () => ({ useDashboardFeed: () => useDashboardFeed() }));

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

describe("conversation row", () => {
  it("deals the chess room", () => {
    render(<ConversationRow />, { wrapper });
    expect(realSlideHeadlines()).toEqual([enMessages.discovery.conversationHeadline]);
  });

  it("carries no Arkade game, which is the other shelf's job", () => {
    render(<ConversationRow />, { wrapper });
    expect(screen.queryByText(enMessages.discovery.checkersIdleHeadline)).toBeNull();
    expect(screen.queryByText(enMessages.discovery.arkballHeadline)).toBeNull();
    expect(screen.queryByRole("link", { name: /Join Now/ })).toBeNull();
  });

  it("sends the heading to the chess lobby, in the same tab", () => {
    render(<ConversationRow />, { wrapper });
    const heading = screen.getByRole("link", { name: enMessages.discovery.conversationTitle });
    expect(heading).toHaveAttribute("href", "/casino/chess");
    expect(heading).not.toHaveAttribute("target");
  });
});
