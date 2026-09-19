import type { ReactNode } from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import enMessages from "@/messages/en.json";
import type { CasinoGame } from "@/features/casino/lib/games";
import { ARKADE_CARD_FRAME, ArkadeGameCard } from "@/features/casino/components/arkade-game-card";

function wrapper({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider locale="en" messages={enMessages}>
      {children}
    </NextIntlClientProvider>
  );
}

function renderCard(ui: ReactNode) {
  return render(<>{ui}</>, { wrapper });
}

// Real catalogue ids, so names and notes resolve out of the shipped en.json
// rather than a key path.
const chess: CasinoGame = {
  id: "chess",
  name: "Chess",
  category: "Skill",
  size: "hero",
  glyph: "♞",
  image: "https://images.unsplash.com/photo-1529699211952-734e80c4d42b",
  isNew: true,
  href: "/casino/chess",
  note: "Staked head-to-head, invite or quick match",
  comingSoon: false,
};

// A playable, non-head-to-head game: its action reads Play, not Challenge.
const arkball: CasinoGame = {
  id: "arkball",
  name: "ArkBall",
  category: "Draws",
  size: "tall",
  glyph: "●",
  image: "/casino/arkade/arkball.png",
  isNew: true,
  href: "/casino/arkball",
  note: "Pick 5 white balls and 1 ArkBall",
  comingSoon: false,
};

// Coming soon and branded: the catalogue asks for its colour to be kept.
const chicken: CasinoGame = {
  id: "chicken",
  name: "Pilot Chicken",
  category: "New",
  size: "tall",
  glyph: "C",
  image: "/casino/chicken/ark-chicken.png",
  preserveImageColor: true,
  href: null,
  comingSoon: true,
};

// Coming soon and unbranded: this one greys out.
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

// No artwork at all, so the glyph fallback stands in.
const glyphOnly: CasinoGame = {
  id: "poker",
  name: "Poker",
  category: "Cards",
  size: "tall",
  glyph: "♠",
  href: "/casino/poker",
  comingSoon: false,
};

function root(container: HTMLElement): HTMLElement {
  return container.firstElementChild as HTMLElement;
}

describe("ArkadeGameCard", () => {
  describe("on phone", () => {
    it("draws the comp's 204px frame at the 20px corner", () => {
      const { container } = renderCard(<ArkadeGameCard game={chess} surface="phone" />);
      const card = root(container);
      expect(card.className).toContain("ws-card");
      expect(card.className).toContain("h-[204px]");
      expect(card.className).toContain("rounded-card");
    });

    it("draws the badge as a solid white pill inset from the top left", () => {
      renderCard(<ArkadeGameCard game={chess} surface="phone" />);
      const badge = screen.getByText(enMessages.casino.hub.badgeNew);
      expect(badge.className).toContain("bg-white");
      expect(badge.className).toContain("rounded-full");
      expect(badge.className).toContain("top-4");
      expect(badge.className).toContain("text-grey-700");
    });

    it("gives the action pill the translucent chrome fill", () => {
      renderCard(<ArkadeGameCard game={chess} surface="phone" />);
      const cta = screen.getByText(enMessages.casino.hub.playNow);
      expect(cta.className).toContain("rounded-full");
      expect(cta.style.backgroundImage).toContain("rgba(255, 255, 255, 0.2) 2.36%");
    });

    it("sets the title at 18px display over a 14px note, 8px apart", () => {
      renderCard(<ArkadeGameCard game={chess} surface="phone" />);
      const title = screen.getByText("Chess");
      expect(title.className).toContain("ws-display");
      expect(title.className).toContain("text-[18px]");
      const note = screen.getByText(chess.note!);
      expect(note.className).toContain("text-[14px]");
      expect(note.className).toContain("line-clamp-2");
      expect(title.parentElement!.className).toContain("gap-2");
    });

    it("navigates with a real anchor, so long press and new tab work", () => {
      renderCard(<ArkadeGameCard game={chess} surface="phone" />);
      const card = screen.getByRole("link", { name: "Play Chess" });
      expect(card.tagName).toBe("A");
      expect(card).toHaveAttribute("href", "/casino/chess");
      expect(card.className).toContain("block");
    });
  });

  describe("on desktop", () => {
    it("draws the 204px frame at the 20px corner with the 1.66px hairline", () => {
      const { container } = renderCard(<ArkadeGameCard game={chess} surface="desktop" />);
      const card = root(container);
      expect(card.className).toContain("h-[204px]");
      expect(card.className).toContain("rounded-[20px]");
      expect(card.className).toContain("border-[1.66px]");
    });

    it("lays the diagonal scrim over the vertical wash", () => {
      const { container } = renderCard(<ArkadeGameCard game={chess} surface="desktop" />);
      const scrim = [...root(container).children].find((child) =>
        (child as HTMLElement).style.backgroundImage.includes("153.72deg")
      ) as HTMLElement;
      expect(scrim).toBeDefined();
      const layers = scrim.style.backgroundImage;
      expect(layers.indexOf("153.72deg")).toBeLessThan(layers.indexOf("rgba(0, 0, 0, 0.35)"));
    });

    it("wears its own New badge as a blue pill inset 14.34px from the top left", () => {
      renderCard(<ArkadeGameCard game={chess} surface="desktop" />);
      const badge = screen.getByText(enMessages.casino.hub.badgeNewSoft);
      expect(badge.className).toContain("bg-[#4382f9]");
      expect(badge.className).toContain("rounded-[20.623px]");
      expect(badge.className).toContain("top-[14.34px]");
      expect(badge.className).toContain("left-[14.34px]");
    });

    it("takes the section's badge tone when the rail sets one", () => {
      const { rerender } = renderCard(
        <ArkadeGameCard game={chess} surface="desktop" badge="mostPlayed" />
      );
      expect(screen.getByText(enMessages.casino.hub.badgeMostPlayed).className).toContain(
        "bg-[#dc343c]"
      );

      rerender(
        <NextIntlClientProvider locale="en" messages={enMessages}>
          <ArkadeGameCard game={chess} surface="desktop" badge="hot" />
        </NextIntlClientProvider>
      );
      expect(screen.getByText(enMessages.casino.hub.badgeHot).className).toContain("bg-[#db990c]");
    });

    it("labels the action Challenge for a head-to-head game, Play otherwise", () => {
      const { unmount } = renderCard(<ArkadeGameCard game={chess} surface="desktop" />);
      const challenge = screen.getByText(enMessages.casino.hub.challenge);
      expect(challenge.className).toContain("bg-[#2d2f31]");
      expect(challenge.className).toContain("w-[95px]");
      unmount();

      renderCard(<ArkadeGameCard game={arkball} surface="desktop" />);
      const play = screen.getByText(enMessages.casino.hub.play);
      expect(play.className).toContain("bg-[#2d2f31]");
      expect(play.className).toContain("w-[85.814px]");
    });

    it("pins the copy in from the bottom-left corner", () => {
      renderCard(<ArkadeGameCard game={chess} surface="desktop" />);
      const copy = screen.getByText("Chess").parentElement!.parentElement!;
      expect(copy.className).toContain("inset-x-[14px]");
      expect(copy.className).toContain("bottom-[13.34px]");
    });

    it("sets the title at 18px bold over a 13px note", () => {
      renderCard(<ArkadeGameCard game={chess} surface="desktop" />);
      const title = screen.getByText("Chess");
      expect(title.className).toContain("text-[18px]");
      expect(title.className).toContain("font-bold");
      const note = screen.getByText(chess.note!);
      expect(note.className).toContain("text-[13px]");
    });

    it("shows the exact live count in the Sporty-style player tag", () => {
      const { container } = renderCard(
        <ArkadeGameCard
          game={chess}
          surface="desktop"
          presence={{ game: "chess", playersOnline: 1086, estimated: true }}
        />
      );

      expect(screen.getByText("1086 players")).toBeInTheDocument();
      expect(container.querySelector('[data-game-presence="chess"]')).not.toBeNull();
    });

    it("hands the card back as a button, with no href of its own", () => {
      renderCard(<ArkadeGameCard game={chess} surface="desktop" />);
      const card = screen.getByRole("button", { name: "Play Chess" });
      expect(card.tagName).toBe("BUTTON");
      expect(card).not.toHaveAttribute("href");
      expect(card.className).not.toContain(" block");
    });

    it("renders as a real anchor when the rail asks for a link", () => {
      renderCard(<ArkadeGameCard game={chess} surface="desktop" render="link" />);
      const card = screen.getByRole("link", { name: "Play Chess" });
      expect(card.tagName).toBe("A");
      expect(card).toHaveAttribute("href", "/casino/chess");
      expect(card.className).toContain("block");
    });
  });

  describe.each(["phone", "desktop"] as const)("on %s", (surface) => {
    it("greys a coming soon game's art but honours preserveImageColor", () => {
      const { container } = renderCard(
        <>
          <ArkadeGameCard game={chicken} surface={surface} />
          <ArkadeGameCard game={ayo} surface={surface} />
        </>
      );
      const images = [...container.querySelectorAll("img")];
      const branded = images.find((img) => img.getAttribute("src") === chicken.image)!;
      const plain = images.find((img) => img.getAttribute("src") === ayo.image)!;
      expect(branded.className).not.toContain("grayscale");
      expect(plain.className).toContain("grayscale");
      expect(plain.className).toContain("opacity-50");
    });

    it("falls back to the glyph when a game has no artwork", () => {
      const { container } = renderCard(<ArkadeGameCard game={glyphOnly} surface={surface} />);
      expect(container.querySelector("img")).toBeNull();
      expect(screen.getByText("♠")).toBeInTheDocument();
    });

    it("does not make a control out of a game with nowhere to go", () => {
      const { container } = renderCard(<ArkadeGameCard game={chicken} surface={surface} />);
      expect(screen.queryByRole("link")).toBeNull();
      expect(screen.queryByRole("button")).toBeNull();
      expect(root(container).tagName).toBe("DIV");
      expect(screen.getByText(enMessages.casino.hub.badgeComingSoon)).toBeInTheDocument();
    });

    it("names the control for the action and the game, not its own text", () => {
      renderCard(<ArkadeGameCard game={chess} surface={surface} />);
      expect(screen.getByRole(surface === "phone" ? "link" : "button")).toHaveAccessibleName(
        "Play Chess"
      );
    });

    it("reports activation to its caller with the game", () => {
      const onActivate = vi.fn();
      renderCard(<ArkadeGameCard game={chess} surface={surface} onActivate={onActivate} />);
      fireEvent.click(screen.getByRole(surface === "phone" ? "link" : "button"));
      expect(onActivate).toHaveBeenCalledTimes(1);
      expect(onActivate).toHaveBeenCalledWith(chess);
    });
  });

  it("keeps the analytics call out of the card entirely", () => {
    // The two surfaces fire game_opened from different places on purpose, and
    // both read TRACKED_GAMES from the one map in the catalogue. A copy of that
    // map, or a track() call, in here would double-report or invent a second id
    // list. That regression has shipped once.
    const source = readFileSync(
      join(process.cwd(), "features/casino/components/arkade-game-card.tsx"),
      "utf8"
    );
    expect(source).not.toContain("TRACKED_GAMES");
    expect(source).not.toContain("lib/analytics");
    expect(source).not.toMatch(/\btrack\(/);
  });

  it("exports a frame class a surface can shape a placeholder with", () => {
    expect(ARKADE_CARD_FRAME).toContain("h-[204px]");
    expect(ARKADE_CARD_FRAME).toContain("rounded-card");
    expect(ARKADE_CARD_FRAME).not.toContain("block");
  });
});
