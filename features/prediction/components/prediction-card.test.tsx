import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import enMessages from "@/messages/en.json";
import type { Prediction } from "@/lib/types";
import { PredictionCard } from "./prediction-card";

const DETAIL_HREF = "/prediction/markets/12345?category=politics&source=markets";

const prediction: Prediction = {
  tag: "Politics",
  vol: "$4.2M vol",
  q: "Will the US cut rates before Q4 2026?",
  yes: "68¢",
  no: "32¢",
  pct: 68,
};

function renderCard(props: Partial<React.ComponentProps<typeof PredictionCard>> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <PredictionCard prediction={prediction} onBuy={vi.fn()} {...props} />
    </NextIntlClientProvider>
  );
}

describe("prediction card", () => {
  it("opens the market from a link named after the question", () => {
    renderCard({ href: DETAIL_HREF });

    const link = screen.getByRole("link", { name: prediction.q });
    expect(link).toHaveAttribute("href", DETAIL_HREF);
  });

  it("puts the market link in the tab order and activates it with Enter", () => {
    renderCard({ href: DETAIL_HREF });

    const link = screen.getByRole("link", { name: prediction.q });
    // A real anchor with an href is tab reachable and Enter-activated by the
    // browser, so the test's job is to prove it is one and that nothing has
    // pulled it out of the tab order.
    expect(link.tagName).toBe("A");
    expect(link).not.toHaveAttribute("tabindex", "-1");
    expect(link).not.toHaveAttribute("aria-hidden");

    link.focus();
    expect(link).toHaveFocus();
  });

  // An anchor around a button is invalid markup, and browsers drop the button
  // out of the tab order when it happens. The stretched link stays a sibling of
  // the pills, never their ancestor.
  it("keeps the outcome buttons outside the market link", () => {
    const onBuy = vi.fn();
    renderCard({ href: DETAIL_HREF, onBuy });

    const link = screen.getByRole("link", { name: prediction.q });
    const yes = screen.getByRole("button", { name: "Yes" });
    const no = screen.getByRole("button", { name: "No" });
    expect(link).not.toContainElement(yes);
    expect(link).not.toContainElement(no);

    yes.focus();
    expect(yes).toHaveFocus();
    fireEvent.click(yes);
    expect(onBuy).toHaveBeenCalledWith(true);

    fireEvent.click(no);
    expect(onBuy).toHaveBeenCalledWith(false);
  });

  // The card carries no identifiers of its own, so a caller with no detail
  // route to point at gets the question as plain text rather than a link that
  // goes nowhere.
  it("renders the question as text when no destination is given", () => {
    renderCard();

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText(prediction.q)).toBeInTheDocument();
  });
});

describe("prediction card, the stretched link", () => {
  // Both assertions below guard defects that shipped and that the rest of this
  // suite could not see: jsdom computes no layout, so a link clipped to nothing
  // still "exists" and still reports the right href. These pin the two causes
  // by name instead.

  it("opts out of the click ripple, which would collapse its own hit area", () => {
    // click-ripple.tsx sets `position: relative` on a statically positioned
    // anchor at pointerdown so it can host the ripple layer. That makes this
    // anchor the containing block for its own stretched ::after, which shrinks
    // from the whole card to the text box between pointerdown and mouseup, so
    // the press lands on nothing. Measured live: 325x210 -> 218x18.
    renderCard({ href: DETAIL_HREF });

    expect(screen.getByRole("link", { name: prediction.q })).toHaveAttribute("data-no-ripple");
  });

  it("keeps the line clamp inside the link, never on an ancestor", () => {
    // `line-clamp` is `overflow: hidden`, and hidden overflow on an ancestor
    // clips the stretched ::after back to the text. The clamp has to sit on a
    // span within the anchor for the whole card to stay pressable.
    renderCard({ href: DETAIL_HREF });
    const link = screen.getByRole("link", { name: prediction.q });

    expect(link.querySelector(".line-clamp-2")).not.toBeNull();
    expect(link.closest(".line-clamp-2")).toBeNull();
  });
});
