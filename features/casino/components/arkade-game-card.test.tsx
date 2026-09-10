import type { ReactNode } from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import enMessages from "@/messages/en.json";
import type { CasinoGame } from "@/features/casino/lib/games";
import {
  ARKADE_CARD_FRAME,
  ArkadeGameCard,
  type ArkadeCardSurface,
} from "@/features/casino/components/arkade-game-card";

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

const SURFACES: ArkadeCardSurface[] = ["phone", "desktop"];

function cardRoot(): HTMLElement {
  const root = document.querySelector<HTMLElement>("[class*='ws-card']");
  if (!root) throw new Error("card frame not found");
  return root;
}

describe("ArkadeGameCard", () => {
  describe.each(SURFACES)("on %s", (surface) => {
    it("draws the comp's 204px frame at the 20px corner", () => {
      renderCard(<ArkadeGameCard game={chess} surface={surface} />);

      const card = cardRoot();
      expect(card.className).toContain("h-[204px]");
      expect(card.className).toContain("rounded-card");
      expect(card.className).toContain("w-full");
    });

    it("lays both scrim layers over the art, the diagonal above the wash", () => {
      renderCard(<ArkadeGameCard game={chess} surface={surface} />);

      const scrim = [...cardRoot().children].find((child) =>
        (child as HTMLElement).style.backgroundImage.includes("153.72deg")
      ) as HTMLElement;
      expect(scrim).toBeDefined();
      // The diagonal darkens the copy corner and is listed first, so it paints
      // over the vertical wash that sinks the bottom of the art to black.
      const layers = scrim.style.backgroundImage;
      expect(layers.indexOf("153.72deg")).toBeLessThan(layers.indexOf("rgba(0, 0, 0, 0.35)"));
    });

    it("draws the badge as a solid white pill inset 16px from the top left", () => {
      renderCard(<ArkadeGameCard game={chess} surface={surface} />);

      const badge = screen.getByText(enMessages.casino.hub.badgeNew);
      expect(badge.className).toContain("bg-white");
      expect(badge.className).toContain("rounded-full");
      expect(badge.className).toContain("top-4");
      expect(badge.className).toContain("left-4");
      // Dark text on the white pill, not the card's white-on-art.
      expect(badge.className).toContain("text-grey-700");
    });

    it("gives the action pill the translucent chrome fill and the comp's edge", () => {
      renderCard(<ArkadeGameCard game={chess} surface={surface} />);

      const cta = screen.getByText(enMessages.casino.hub.playNow);
      expect(cta.className).toContain("rounded-full");
      expect(cta.className).toContain("border-white");
      // 20% alpha, so the artwork reads through it. An opaque chrome would be
      // a different pill.
      expect(cta.style.backgroundImage).toContain("rgba(255, 255, 255, 0.2) 2.36%");
      expect(cta.style.boxShadow).toContain("inset 0 0.667px 0 rgba(255,255,255,0.95)");
    });

    it("pins the copy and the pill 16px in from the bottom corners", () => {
      renderCard(<ArkadeGameCard game={chess} surface={surface} />);

      const row = screen.getByText("Chess").parentElement!.parentElement!;
      expect(row.className).toContain("inset-x-4");
      expect(row.className).toContain("bottom-4");
      expect(row.className).toContain("justify-between");
    });

    it("sets the title at 18px display over a 14px note, 8px apart", () => {
      renderCard(<ArkadeGameCard game={chess} surface={surface} />);

      const title = screen.getByText("Chess");
      expect(title.className).toContain("ws-display");
      expect(title.className).toContain("text-[18px]");

      const note = screen.getByText(chess.note!);
      expect(note.className).toContain("text-[14px]");
      // gap-2 is the 8px between the two, set on the column that holds them.
      expect(title.parentElement!.className).toContain("gap-2");
    });

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
      // Pilot Chicken lost its colour on the phone and kept it on the laptop
      // once, because the flag was honoured in one transcription only.
      expect(branded.className).not.toContain("grayscale");
      expect(branded.className).not.toContain("opacity-50");
      expect(plain.className).toContain("grayscale");
      expect(plain.className).toContain("opacity-50");
    });

    it("falls back to the glyph when a game has no artwork", () => {
      const { container } = renderCard(<ArkadeGameCard game={glyphOnly} surface={surface} />);

      expect(container.querySelector("img")).toBeNull();
      expect(screen.getByText("♠")).toBeInTheDocument();
    });

    it("does not make a control out of a game with nowhere to go", () => {
      const onActivate = vi.fn();
      renderCard(<ArkadeGameCard game={chicken} surface={surface} onActivate={onActivate} />);

      // Not a dead tab stop: plain content, with the badge carrying the reason.
      expect(screen.queryByRole("link")).toBeNull();
      expect(screen.queryByRole("button")).toBeNull();
      expect(cardRoot().tagName).toBe("DIV");
      expect(cardRoot()).not.toHaveAttribute("tabindex");
      expect(screen.getByText(enMessages.casino.hub.badgeComingSoon)).toBeInTheDocument();
      expect(screen.queryByText(enMessages.casino.hub.playNow)).toBeNull();
    });

    it("names the control for the action and the game, not its own text", () => {
      renderCard(<ArkadeGameCard game={chess} surface={surface} />);

      // "Chess / Staked head-to-head / Play now" reads as a fragment; the
      // label states what activating it does.
      expect(screen.getByRole(surface === "phone" ? "link" : "button")).toHaveAccessibleName(
        "Play Chess"
      );
    });
  });

  it("navigates the phone with a real anchor, so long press and new tab work", () => {
    renderCard(<ArkadeGameCard game={chess} surface="phone" />);

    const card = screen.getByRole("link", { name: "Play Chess" });
    expect(card.tagName).toBe("A");
    expect(card).toHaveAttribute("href", "/casino/chess");
    // An inline anchor would leave a descender gap under the card.
    expect(card.className).toContain("block");
  });

  it("hands the desktop card back as a button, with no href of its own", () => {
    renderCard(<ArkadeGameCard game={chess} surface="desktop" />);

    const card = screen.getByRole("button", { name: "Play Chess" });
    expect(card.tagName).toBe("BUTTON");
    expect(card).not.toHaveAttribute("href");
    // A native button is in the tab order and turns Enter and Space into a
    // click; a div with onClick does neither.
    card.focus();
    expect(card).toHaveFocus();
    // It must stay inline-block: `block` would add 5.5px to every desktop row.
    expect(card.className).not.toContain(" block");
  });

  it.each(SURFACES)("reports activation to its caller with the game, on %s", (surface) => {
    const onActivate = vi.fn();
    renderCard(<ArkadeGameCard game={chess} surface={surface} onActivate={onActivate} />);

    fireEvent.click(screen.getByRole(surface === "phone" ? "link" : "button"));
    expect(onActivate).toHaveBeenCalledTimes(1);
    expect(onActivate).toHaveBeenCalledWith(chess);
  });

  it("keeps the analytics call out of the card entirely", () => {
    // The two surfaces fire game_opened from different places on purpose: the
    // phone from this card's anchor click, the desktop from the route that
    // owns the router push. Both read TRACKED_GAMES from the one map in the
    // catalogue. A copy of that map, or a track() call, in here would either
    // double-report the phone or invent a second id list. That regression has
    // already shipped once.
    const source = readFileSync(
      join(process.cwd(), "features/casino/components/arkade-game-card.tsx"),
      "utf8"
    );
    expect(source).not.toContain("TRACKED_GAMES");
    expect(source).not.toContain("lib/analytics");
    expect(source).not.toMatch(/\btrack\(/);
  });

  it("exports a frame class a surface can shape a placeholder with", () => {
    // Both rows draw their loading skeleton with it, so a placeholder cannot
    // drift from the card it stands in for.
    expect(ARKADE_CARD_FRAME).toContain("h-[204px]");
    expect(ARKADE_CARD_FRAME).toContain("rounded-card");
    // The interaction element adds its own display; baking one in here would
    // change the desktop button's box.
    expect(ARKADE_CARD_FRAME).not.toContain("block");
  });

  it("keeps the surfaces at the metrics each one shipped with", () => {
    // The two transcriptions drifted before they were merged. This extraction
    // is a refactor, so it preserves both exactly; the row below is what a
    // ruling on the drift has to change.
    const { unmount } = renderCard(<ArkadeGameCard game={chess} surface="phone" />);
    const phone = {
      badge: screen.getByText(enMessages.casino.hub.badgeNew).className,
      cta: screen.getByText(enMessages.casino.hub.playNow).className,
      note: screen.getByText(chess.note!).className,
    };
    unmount();

    renderCard(<ArkadeGameCard game={chess} surface="desktop" />);
    const desktop = {
      badge: screen.getByText(enMessages.casino.hub.badgeNew).className,
      cta: screen.getByText(enMessages.casino.hub.playNow).className,
      note: screen.getByText(chess.note!).className,
    };

    // The phone matches the comp: a 30px badge and a 36px action pill.
    expect(phone.badge).toContain("h-[30px]");
    expect(phone.badge).toContain("text-[13px]");
    expect(phone.cta).toContain("h-9");
    expect(phone.cta).toContain("text-[12px]");
    expect(phone.note).toContain("line-clamp-2");

    // The desktop is 24px and 33.5px, sized by padding rather than height.
    expect(desktop.badge).toContain("py-0.5");
    expect(desktop.badge).toContain("text-[12px]");
    expect(desktop.cta).toContain("py-2.5");
    expect(desktop.cta).toContain("text-[11.5px]");
    expect(desktop.note).not.toContain("line-clamp-2");
  });
});
