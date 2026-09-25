import type { ReactNode } from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import enMessages from "@/messages/en.json";
import { CASINO_GAMES, type CasinoGame } from "@/features/casino/lib/games";

vi.mock("@/lib/analytics/mixpanel", () => ({ track: vi.fn() }));
// The surface reads the wallet balance for the header pill; the balance itself
// is not under test, so the hook is stubbed to a settled, empty portfolio.
vi.mock("@/hooks/use-portfolio", () => ({
  usePortfolio: () => ({ tokens: [], loading: false, totalUsd: 0 }),
}));

// The hub now carries the arcade's Shine switch. Its own behaviour is covered
// by components/shine/shine-toggle.test.tsx; here the account read is stubbed
// so the hub can be rendered without a query client, and the switch is on the
// page as a real control rather than a placeholder.
vi.mock("@/hooks/use-shine", () => ({
  useShine: () => ({
    preferences: { arcade: true },
    isResolved: true,
    isLoading: false,
    isSignedIn: true,
    isSaving: false,
    error: null,
    isOn: () => true,
    mayPost: () => true,
    setShine: async () => {},
    refetch: () => {},
  }),
}));

import { track } from "@/lib/analytics/mixpanel";
import { ArkadeMobile } from "@/features/casino/components/arkade-mobile";

const tracked = vi.mocked(track);

function wrapper({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider locale="en" messages={enMessages}>
      {children}
    </NextIntlClientProvider>
  );
}

function renderMobile(ui: ReactNode) {
  return render(<>{ui}</>, { wrapper });
}

// Ids the shipped catalogue carries, so names and notes resolve out of the real
// en.json rather than a key path.
const chess: CasinoGame = {
  id: "chess",
  name: "Chess",
  category: "Skill",
  size: "hero",
  glyph: "♞",
  image: "/casino/arkade/chess.png",
  isNew: true,
  href: "/casino/chess",
  note: "Staked head-to-head, invite or quick match",
  comingSoon: false,
};

const arkball: CasinoGame = {
  id: "arkball",
  name: "ArkBall",
  category: "Draws",
  size: "tall",
  glyph: "●",
  image: "/casino/arkade/arkball.png",
  href: "/casino/arkball",
  note: "Pick 5 white balls and 1 ArkBall",
  comingSoon: false,
};

const lastMan: CasinoGame = {
  id: "last-standing",
  name: "The Last Man",
  category: "New",
  size: "hero",
  glyph: "⌛",
  image: "/casino/arkade/last-standing.png",
  href: "/casino/last-standing",
  note: "Outlast everyone, winner takes the pot",
  comingSoon: false,
};

// Coming soon and unbranded: no destination, so it is content, not a control.
const ayo: CasinoGame = {
  id: "ayo",
  name: "Ayo",
  category: "New",
  size: "tall",
  glyph: "◉",
  image: "https://images.unsplash.com/photo-1585504198199-20277593b94f",
  href: null,
  note: "Staked mancala, head-to-head",
  comingSoon: true,
};

// A game that is playable but has no agreed analytics id, which is the case
// the catalogue's map is there to handle.
const poker: CasinoGame = {
  ...ayo,
  id: "poker",
  name: "Poker",
  href: "/casino/poker",
  comingSoon: false,
};

const sample = [chess, arkball, lastMan, ayo];

describe("ArkadeMobile", () => {
  beforeEach(() => tracked.mockClear());

  it("draws the featured banner ahead of the rails when nothing is filtered", () => {
    renderMobile(<ArkadeMobile games={sample} />);

    // The comp opens with the Featured spotlight over the Trending/New rails.
    expect(screen.getByText(enMessages.casino.hub.featured)).toBeInTheDocument();
    expect(screen.getByText(enMessages.casino.hub.trendingTitle)).toBeInTheDocument();
    expect(screen.getByText(enMessages.casino.hub.newTitle)).toBeInTheDocument();
  });

  it("lays the catalogue out as the desktop card in horizontal rails", () => {
    renderMobile(<ArkadeMobile games={[chess, arkball, lastMan]} />);

    const card = screen.getByRole("link", { name: "Play Chess" });
    // The 204px desktop card at the 20px radius and 1.66px hairline, not the old
    // phone tile — only the rail around it is new.
    expect(card.className).toContain("h-[204px]");
    expect(card.className).toContain("rounded-[20px]");
    expect(card.className).toContain("border-[1.66px]");
    // A real anchor so a long-press and open-in-new-tab work.
    expect(card.tagName).toBe("A");
    expect(card).toHaveAttribute("href", "/casino/chess");
  });

  it("wears the section's colored badge, not a white pill", () => {
    renderMobile(<ArkadeMobile games={[chess, arkball, lastMan]} />);

    // Trending leads with a red Most Played tile over amber Hot ones.
    const mostPlayed = screen.getByText(enMessages.casino.hub.badgeMostPlayed);
    expect(mostPlayed.className).toContain("bg-[#dc343c]");
    expect(mostPlayed.className).not.toContain("bg-white");
  });

  it("carries a search field the phone can filter with", () => {
    renderMobile(<ArkadeMobile games={sample} />);

    const search = screen.getByRole("searchbox");
    fireEvent.change(search, { target: { value: "chess" } });

    // Filtering collapses the banner and section headings to a single rail.
    expect(screen.queryByText(enMessages.casino.hub.trendingTitle)).toBeNull();
    expect(screen.getByRole("link", { name: "Play Chess" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Play ArkBall" })).toBeNull();
  });

  it("gives every category tab a 44px hit area", () => {
    renderMobile(<ArkadeMobile games={sample} />);

    const tabs = within(screen.getByRole("group", { name: "Game categories" })).getAllByRole(
      "button"
    );
    expect(tabs).toHaveLength(4);
    for (const tab of tabs) expect(tab.className).toContain("h-11");
  });

  it("slides one underline segment to the tab that is pressed", () => {
    const { container } = renderMobile(<ArkadeMobile games={sample} />);

    const segment = container.querySelector<HTMLElement>("[data-testid='category-underline']")!;
    expect(segment.style.transform).toBe("translateX(0px)");

    fireEvent.click(screen.getByRole("button", { name: enMessages.casino.hub.categoryCards }));
    // 101px tabs, 12px apart, so the third slot starts 226px along.
    expect(segment.style.transform).toBe("translateX(226px)");
  });

  it("reports game_opened with the catalogue's analytics id", () => {
    renderMobile(<ArkadeMobile games={[chess, arkball, lastMan, poker]} />);

    fireEvent.click(screen.getByRole("link", { name: "Play Chess" }));
    expect(tracked).toHaveBeenCalledWith("game_opened", { game: "chess" });
    // Exactly once. The card is shared with the desktop rail and reports nothing
    // itself, so a second call would mean the event had been duplicated.
    expect(tracked).toHaveBeenCalledTimes(1);

    // ArkBall has an id of its own now, and reports under it.
    tracked.mockClear();
    fireEvent.click(screen.getByRole("link", { name: "Play ArkBall" }));
    expect(tracked).toHaveBeenCalledWith("game_opened", { game: "arkball" });

    // Poker has no agreed analytics id, so opening it reports nothing rather
    // than inventing one.
    tracked.mockClear();
    fireEvent.click(screen.getByRole("link", { name: "Play Poker" }));
    expect(tracked).not.toHaveBeenCalled();
  });

  it("does not make a control out of a game with nowhere to go", () => {
    renderMobile(<ArkadeMobile games={[ayo]} />);

    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText(enMessages.casino.hub.badgeComingSoon)).toBeInTheDocument();
  });

  it("narrows the catalogue by category, and goes back to all of it", () => {
    renderMobile(<ArkadeMobile games={sample} />);
    // chess, arkball, last-standing are playable; ayo is coming soon.
    expect(screen.getAllByRole("link")).toHaveLength(3);

    fireEvent.click(screen.getByRole("button", { name: enMessages.casino.hub.categoryDraws }));
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Play ArkBall" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: enMessages.casino.hub.categoryAll }));
    expect(screen.getAllByRole("link")).toHaveLength(3);
  });

  it("says so when a category holds nothing", () => {
    renderMobile(<ArkadeMobile games={sample} />);

    // Nothing in the sample is a card game, so this is the empty state.
    fireEvent.click(screen.getByRole("button", { name: enMessages.casino.hub.categoryCards }));
    expect(screen.queryByRole("list")).toBeNull();
    expect(screen.getByText(enMessages.casino.hub.noGamesFound)).toBeInTheDocument();
  });

  it("draws placeholder cards while a caller is still loading the catalogue", () => {
    renderMobile(<ArkadeMobile games={[]} loading />);

    const status = screen.getByRole("status", { name: enMessages.casino.hub.loadingGames });
    expect(status.getAttribute("aria-busy")).toBe("true");
    expect(status.children.length).toBeGreaterThan(0);
    expect(screen.queryByText(enMessages.casino.hub.noGamesFound)).toBeNull();
  });

  it("defaults to the shipped catalogue", () => {
    renderMobile(<ArkadeMobile />);
    // Every playable game becomes an anchor; coming-soon entries stay content.
    const playable = CASINO_GAMES.filter((game) => game.href && !game.comingSoon).length;
    expect(screen.getAllByRole("link")).toHaveLength(playable);
  });

  it("carries the arcade's Shine switch where it cannot be missed", () => {
    // One switch governs every game in the arcade, and it is on by default.
    // Putting it on the hub means the first place a person meets Shine is the
    // page they play from, rather than a post that already exists.
    renderMobile(<ArkadeMobile />);
    const shine = screen.getByRole("switch", {
      name: enMessages.shine.toggleLabel,
    });
    expect(shine).toBeTruthy();
    expect(shine.closest("section")?.textContent).toContain(enMessages.shine.keepsPosts);
  });
});
