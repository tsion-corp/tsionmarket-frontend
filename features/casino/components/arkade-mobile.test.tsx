import type { ReactNode } from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import enMessages from "@/messages/en.json";
import { CASINO_GAMES, type CasinoGame } from "@/features/casino/lib/games";

vi.mock("@/lib/analytics/mixpanel", () => ({ track: vi.fn() }));

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
  image: "/rollout/arkade/card-chess-red-king.png",
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
  image: "/casino/arkball/hero.png",
  href: "/casino/arkball",
  note: "Pick 5 white balls and 1 ArkBall",
  comingSoon: false,
};

// Coming soon and branded: the desktop keeps this one in colour, so the phone
// has to as well.
// A branded, coming-soon stand-in. The catalogue id has to be one this build's
// catalogs name, since the card reads the name the player sees from them.
const chicken: CasinoGame = {
  id: "last-standing",
  name: "The Last Man",
  category: "New",
  size: "tall",
  glyph: "C",
  image: "/casino/chicken/ark-chicken.png",
  preserveImageColor: true,
  href: null,
  comingSoon: true,
};

// Coming soon and unbranded: this one does grey out.
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

const sample = [chess, arkball, chicken, ayo];

function cards(): HTMLElement[] {
  return screen.getAllByRole("listitem").map((item) => item.firstElementChild as HTMLElement);
}

describe("ArkadeMobile", () => {
  beforeEach(() => tracked.mockClear());

  it("stacks the catalogue one card per row at the comp's 204px height", () => {
    renderMobile(<ArkadeMobile games={sample} />);

    const list = screen.getByRole("list");
    expect(within(list).getAllByRole("listitem")).toHaveLength(sample.length);
    // 204px tall at the 20px radius, exactly the card the desktop comp draws.
    // The old phone tile was a 128px minimum at 16px, which cropped the art to
    // a strip and left the copy sitting on top of it.
    for (const card of cards()) {
      expect(card.className).toContain("h-[204px]");
      expect(card.className).toContain("rounded-card");
      expect(card.className).not.toContain("min-h-[128px]");
    }
  });

  it("draws the badge as the comp's solid white pill", () => {
    renderMobile(<ArkadeMobile games={[chess]} />);

    const badge = screen.getByText(enMessages.casino.hub.badgeNew);
    expect(badge.className).toContain("bg-white");
    expect(badge.className).toContain("rounded-full");
    // The old chip was a dark translucent square. The comp inverts it.
    expect(badge.className).not.toContain("bg-black/55");
  });

  it("labels the action Play now, as the comp does", () => {
    renderMobile(<ArkadeMobile games={[chess, arkball]} />);

    expect(screen.getAllByText(enMessages.casino.hub.playNow)).toHaveLength(2);
    expect(screen.queryByText(enMessages.casino.hub.explore)).toBeNull();
  });

  it("leaves the balance chip out, since the comp does not draw one", () => {
    const { container } = renderMobile(<ArkadeMobile games={sample} />);

    // The chip was the screen's only async dependency. The comp has no balance
    // on it, and games spend from the same wallet the rest of the app shows.
    expect(container.querySelector('[data-sensitive="balance"]')).toBeNull();
  });

  it("gives every category tab a 44px hit area", () => {
    renderMobile(<ArkadeMobile games={sample} />);

    const tabs = within(screen.getByRole("group", { name: "Game categories" })).getAllByRole(
      "button"
    );
    expect(tabs.length).toBeGreaterThan(1);
    for (const tab of tabs) expect(tab.className).toContain("h-11");
  });

  it("slides one underline segment to the tab that is pressed", () => {
    const { container } = renderMobile(<ArkadeMobile games={sample} />);

    const segment = container.querySelector<HTMLElement>("[data-testid='category-underline']")!;
    expect(segment.style.transform).toBe("translateX(0px)");

    fireEvent.click(screen.getByRole("button", { name: enMessages.casino.hub.categoryCards }));
    // 101px tabs, 12px apart, so the second slot starts 113px along.
    expect(segment.style.transform).toBe("translateX(226px)");
  });

  it("gives the search field an accessible name and the comp's pill shape", () => {
    const { container } = renderMobile(<ArkadeMobile games={sample} />);

    const input = screen.getByRole("searchbox", {
      name: enMessages.casino.hub.searchPlaceholder,
    });
    const field = input.parentElement!;
    expect(field.className).toContain("h-[52px]");
    expect(field.className).toContain("rounded-full");
    expect(container.querySelector("h1")?.className).toContain("sr-only");
  });

  it("keeps branded artwork in colour when the catalogue asks for it", () => {
    const { container } = renderMobile(<ArkadeMobile games={[chicken, ayo]} />);

    const images = Array.from(container.querySelectorAll("img"));
    const branded = images.find((img) => img.getAttribute("src") === chicken.image)!;
    const plain = images.find((img) => img.getAttribute("src") === ayo.image)!;
    // The desktop row honours preserveImageColor; the phone greyed everything
    // that was coming soon, so Pilot Chicken lost its colour on a phone only.
    expect(branded.className).not.toContain("grayscale");
    expect(plain.className).toContain("grayscale");
  });

  it("reports game_opened with the catalogue's analytics id", () => {
    renderMobile(<ArkadeMobile games={[chess, arkball]} />);

    fireEvent.click(screen.getByRole("link", { name: "Play Chess" }));
    expect(tracked).toHaveBeenCalledWith("game_opened", { game: "chess" });
    // Exactly once. The card is shared with the desktop rail and reports
    // nothing itself, so a second call here would mean the event had been
    // duplicated into the card as well as this surface.
    expect(tracked).toHaveBeenCalledTimes(1);

    // ArkBall has no agreed analytics id, so opening it reports nothing rather
    // than inventing one.
    tracked.mockClear();
    fireEvent.click(screen.getByRole("link", { name: "Play ArkBall" }));
    expect(tracked).not.toHaveBeenCalled();
  });

  it("draws the catalogue with the shared card, as anchors", () => {
    renderMobile(<ArkadeMobile games={[chess, arkball]} />);

    // The phone navigates with a real anchor so a long press and an
    // open-in-new-tab work; the desktop rail draws the same card as a button.
    for (const card of cards()) {
      expect(card.className).toContain("ws-card");
      expect(card.tagName).toBe("A");
      expect(card).toHaveAttribute("href");
    }
    // Comp metrics for the phone: a 30px badge and a 36px action pill.
    expect(screen.getAllByText(enMessages.casino.hub.playNow)[0].className).toContain("h-9");
  });

  it("does not make a control out of a game with nowhere to go", () => {
    renderMobile(<ArkadeMobile games={[chicken]} />);

    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText(enMessages.casino.hub.badgeComingSoon)).toBeInTheDocument();
  });

  it("narrows the catalogue by category and by the name the player sees", () => {
    renderMobile(<ArkadeMobile games={sample} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(4);

    fireEvent.click(screen.getByRole("button", { name: enMessages.casino.hub.categoryDraws }));
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByText("ArkBall")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: enMessages.casino.hub.categoryAll }));
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "last man" } });
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByText("The Last Man")).toBeInTheDocument();
  });

  it("says so when nothing matches the search", () => {
    renderMobile(<ArkadeMobile games={sample} />);

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "roulette" } });
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
    expect(screen.getAllByRole("listitem")).toHaveLength(CASINO_GAMES.length);
  });
});
