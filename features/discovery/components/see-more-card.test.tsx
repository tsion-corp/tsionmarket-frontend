import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import enMessages from "@/messages/en.json";
import { SeeMoreCard } from "./see-more-card";

function renderCard(props: Partial<React.ComponentProps<typeof SeeMoreCard>> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <SeeMoreCard headline="Bet On What’s Next?" href="/prediction" {...props} />
    </NextIntlClientProvider>
  );
}

describe("SeeMoreCard", () => {
  it("draws the headline the shelf passes it", () => {
    renderCard({ headline: "Ride the Hype" });
    expect(screen.getByRole("heading", { name: "Ride the Hype" })).toBeInTheDocument();
  });

  // The end cap is a doorway, not an action. The pills on the cards before it
  // act on their own asset in place; this one has to leave for the desk, so it
  // must render as a real link with a real href rather than a button.
  it("leaves for the desk it was given", () => {
    renderCard({ href: "/meme" });
    const cta = screen.getByRole("link", { name: enMessages.discovery.seeMore });
    expect(cta).toHaveAttribute("href", "/meme");
  });

  // Each shelf draws its cards at its own height and radius, and the end cap
  // has to sit flush beside them rather than at a box of its own.
  it("wears the box its shelf gives it", () => {
    const { container } = renderCard({ className: "min-h-[222px] rounded-[15px]" });
    const card = container.querySelector("article");
    expect(card).toHaveClass("min-h-[222px]", "rounded-[15px]");
  });

  // The star field is decoration. It must never be announced, and it must never
  // sit between a pointer and the pill.
  it("keeps its art out of the way", () => {
    const { container } = renderCard();
    const art = container.querySelectorAll('[aria-hidden="true"]');
    expect(art.length).toBeGreaterThan(0);
    art.forEach((layer) => expect(layer).toHaveClass("pointer-events-none"));
  });
});
