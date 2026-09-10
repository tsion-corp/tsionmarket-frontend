import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import enMessages from "@/messages/en.json";
import type { CasinoGame } from "@/features/casino/lib/games";

vi.mock("@/lib/analytics/mixpanel", () => ({ track: vi.fn() }));

import { track } from "@/lib/analytics/mixpanel";
import { ArkadeDesktop } from "@/features/casino/components/arkade-desktop";
import { ArkadeDesktopRow } from "@/features/casino/components/arkade-desktop-row";

const tracked = vi.mocked(track);

// Copy the desktop Arkade needs that the catalogues do not carry yet. The
// adoption PR adds these six keys to en, de, es, fr and pt; until then the
// English strings live here so the assertions below read the real copy rather
// than a key path. Keep the two lists in step.
const PENDING_HUB_KEYS = {
  playNow: "Play now",
  openGame: "Play {name}",
  categoriesLabel: "Game categories",
  rowLabel: "Arkade games, row {index}",
  emptyCategory: "No games in this category yet.",
  loadingGames: "Loading games",
};

const messages = {
  ...enMessages,
  casino: {
    ...enMessages.casino,
    hub: { ...enMessages.casino.hub, ...PENDING_HUB_KEYS },
  },
};

function wrapper({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider locale="en" messages={messages}>
      {children}
    </NextIntlClientProvider>
  );
}

function renderWithIntl(ui: ReactNode) {
  return render(<>{ui}</>, { wrapper });
}

// A small stand-in catalogue. It uses real catalogue ids so the component can
// resolve names and notes out of the shipped en.json, and it spans the three
// states a tile has: playable with local art, playable with remote art, and
// coming soon.
const chess: CasinoGame = {
  id: "chess",
  name: "Chess",
  category: "Skill",
  size: "hero",
  glyph: "♞",
  image: "https://images.unsplash.com/photo-1529699211952-734e80c4d42b",
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
  image: "/casino/arkball/hero.png",
  href: "/casino/arkball",
  note: "Pick 5 white balls and 1 ArkBall",
  comingSoon: false,
};

const checkers: CasinoGame = {
  id: "checkers",
  name: "Checkers",
  category: "Skill",
  size: "tall",
  glyph: "⛃",
  image: "https://upload.wikimedia.org/wikipedia/commons/3/30/International_draughts.jpg",
  href: "/casino/checkers",
  note: "Fast staked matches",
  comingSoon: false,
};

const lastStanding: CasinoGame = {
  id: "last-standing",
  name: "The Last Man",
  category: "New",
  size: "tall",
  glyph: "♛",
  image: "/casino/last-standing/hero.png",
  href: "/casino/last-standing",
  note: "Last wager standing takes the pot",
  comingSoon: false,
};

const poker: CasinoGame = {
  id: "poker",
  name: "Poker",
  category: "Cards",
  size: "tall",
  glyph: "♠",
  image: "https://images.unsplash.com/photo-1541278107931-e006523892df",
  href: null,
  comingSoon: true,
};

const catalogue = [chess, arkball, checkers, lastStanding, poker];

describe("ArkadeDesktopRow", () => {
  it("renders one tile per game it is given, in order", () => {
    renderWithIntl(<ArkadeDesktopRow games={[chess, arkball, checkers]} label="Row 1" />);

    const rail = screen.getByRole("list", { name: "Row 1" });
    const tiles = within(rail).getAllByRole("listitem");
    expect(tiles).toHaveLength(3);
    expect(within(rail).getByText("Chess")).toBeInTheDocument();
    expect(within(rail).getByText("ArkBall")).toBeInTheDocument();
    expect(within(rail).getByText("Checkers")).toBeInTheDocument();
  });

  it("gives every playable tile an accessible name and fires the callback with its game", () => {
    const onSelectGame = vi.fn();
    renderWithIntl(
      <ArkadeDesktopRow games={[chess, arkball]} label="Row 1" onSelectGame={onSelectGame} />
    );

    const tile = screen.getByRole("button", { name: "Play Chess" });
    expect(screen.getByRole("button", { name: "Play ArkBall" })).toBeInTheDocument();

    fireEvent.click(tile);
    expect(onSelectGame).toHaveBeenCalledTimes(1);
    expect(onSelectGame).toHaveBeenCalledWith(chess);
  });

  it("makes the tile a real button, so a keyboard reaches and operates it", () => {
    const onSelectGame = vi.fn();
    renderWithIntl(<ArkadeDesktopRow games={[chess]} label="Row 1" onSelectGame={onSelectGame} />);

    const tile = screen.getByRole("button", { name: "Play Chess" });
    // A native button is in the tab order and turns Enter and Space into a
    // click; a div with onClick does neither.
    expect(tile.tagName).toBe("BUTTON");
    expect(tile).not.toHaveAttribute("tabindex", "-1");
    tile.focus();
    expect(tile).toHaveFocus();
  });

  it("renders the empty treatment, and no tiles, for a category with no games", () => {
    renderWithIntl(<ArkadeDesktopRow games={[]} label="Row 1" />);

    expect(screen.getByText("No games in this category yet.")).toBeInTheDocument();
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("renders a busy placeholder rail while games are loading", () => {
    renderWithIntl(<ArkadeDesktopRow games={[]} label="Row 1" loading />);

    const rail = screen.getByRole("status", { name: "Loading games" });
    expect(rail).toHaveAttribute("aria-busy", "true");
    // Placeholders only: nothing clickable, and not the empty copy either.
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.queryByText("No games in this category yet.")).not.toBeInTheDocument();
  });

  it("shows a coming soon game without making it clickable", () => {
    renderWithIntl(<ArkadeDesktopRow games={[poker]} label="Row 1" />);

    expect(screen.getByText("Poker")).toBeInTheDocument();
    expect(screen.getByText(enMessages.casino.hub.badgeComingSoon)).toBeInTheDocument();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("leaves game_opened to the route that owns the navigation", () => {
    // The desktop rail is presentational: it hands the game back and the
    // casino route fires the event beside its router push. Reporting from the
    // shared card as well would double-count every desktop open, and the two
    // surfaces would need two copies of the catalogue's id map.
    tracked.mockClear();
    const onSelectGame = vi.fn();
    renderWithIntl(<ArkadeDesktopRow games={[chess]} label="Row 1" onSelectGame={onSelectGame} />);

    fireEvent.click(screen.getByRole("button", { name: "Play Chess" }));
    expect(onSelectGame).toHaveBeenCalledWith(chess);
    expect(tracked).not.toHaveBeenCalled();
  });

  it("draws the rail with the shared card, as buttons", () => {
    renderWithIntl(<ArkadeDesktopRow games={[chess, arkball]} label="Row 1" />);

    for (const item of screen.getAllByRole("listitem")) {
      const card = item.firstElementChild as HTMLElement;
      expect(card.className).toContain("ws-card");
      expect(card.className).toContain("h-[204px]");
      expect(card.tagName).toBe("BUTTON");
    }
    // Desktop metrics: the badge and the pill are sized by padding here, not
    // by a fixed height the way the phone's are.
    expect(screen.getAllByText("Play now")[0].className).toContain("py-2.5");
  });

  it("draws cover art with object-fit cover, so nothing figurative is stretched", () => {
    const { container } = renderWithIntl(<ArkadeDesktopRow games={[chess]} label="Row 1" />);

    const art = container.querySelector("img");
    expect(art).not.toBeNull();
    expect(art).toHaveAttribute("src", chess.image);
    expect(art?.className).toContain("object-cover");
  });
});

describe("ArkadeDesktop", () => {
  it("lays the catalogue out as rails of three, as the desktop comp draws it", () => {
    renderWithIntl(<ArkadeDesktop games={catalogue} />);

    // Five games chunked three to a rail is two rails, the second half full.
    const rails = screen.getAllByRole("list");
    expect(rails).toHaveLength(2);
    expect(within(rails[0]).getAllByRole("listitem")).toHaveLength(3);
    expect(within(rails[1]).getAllByRole("listitem")).toHaveLength(2);
  });

  it("renders every game in the catalogue it is handed", () => {
    renderWithIntl(<ArkadeDesktop games={catalogue} />);

    for (const name of ["Chess", "ArkBall", "Checkers", "The Last Man", "Poker"]) {
      expect(screen.getByText(name)).toBeInTheDocument();
    }
  });

  it("filters the rails when a category is chosen", () => {
    renderWithIntl(<ArkadeDesktop games={catalogue} />);

    fireEvent.click(screen.getByRole("button", { name: enMessages.casino.hub.categorySkill }));

    expect(screen.getByText("Chess")).toBeInTheDocument();
    expect(screen.getByText("Checkers")).toBeInTheDocument();
    expect(screen.queryByText("ArkBall")).not.toBeInTheDocument();
    expect(screen.queryByText("Poker")).not.toBeInTheDocument();
  });

  it("marks the chosen category pressed and the others not", () => {
    renderWithIntl(<ArkadeDesktop games={catalogue} />);

    const all = screen.getByRole("button", { name: enMessages.casino.hub.categoryAll });
    const cards = screen.getByRole("button", { name: enMessages.casino.hub.categoryCards });
    expect(all).toHaveAttribute("aria-pressed", "true");
    expect(cards).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(cards);
    expect(cards).toHaveAttribute("aria-pressed", "true");
    expect(all).toHaveAttribute("aria-pressed", "false");
  });

  it("renders the empty treatment when the chosen category has no games", () => {
    // Nothing in this fixture is a Draws game once ArkBall is removed.
    renderWithIntl(<ArkadeDesktop games={[chess, checkers]} />);

    fireEvent.click(screen.getByRole("button", { name: enMessages.casino.hub.categoryDraws }));

    expect(screen.getByText("No games in this category yet.")).toBeInTheDocument();
    expect(screen.queryByText("Chess")).not.toBeInTheDocument();
  });

  it("passes the tile callback through to the rails", () => {
    const onSelectGame = vi.fn();
    renderWithIntl(<ArkadeDesktop games={catalogue} onSelectGame={onSelectGame} />);

    fireEvent.click(screen.getByRole("button", { name: "Play The Last Man" }));
    expect(onSelectGame).toHaveBeenCalledWith(lastStanding);
  });

  it("shows loading rails, and no tiles, while the catalogue is loading", () => {
    renderWithIntl(<ArkadeDesktop games={[]} loading />);

    expect(screen.getAllByRole("status", { name: "Loading games" }).length).toBeGreaterThan(0);
    expect(screen.queryByText("No games in this category yet.")).not.toBeInTheDocument();
  });
});
