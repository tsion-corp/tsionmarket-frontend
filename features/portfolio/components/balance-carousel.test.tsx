import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/messages/en.json";

// Embla measures real boxes and jsdom has none, so the carousel's engine is
// replaced by a recorder. What is under test is the WIRING: that a card asked
// for by the page's scroll reaches the carousel, and — the part that actually
// matters — that it is asked for only when it changes, so a reader who swipes
// back is not dragged forward again on the next scroll frame.
const scrollTo = vi.hoisted(() => vi.fn());
const handlers = vi.hoisted(() => new Map<string, () => void>());
vi.mock("embla-carousel-react", () => ({
  default: () => [
    () => {},
    {
      scrollTo,
      selectedScrollSnap: () => 0,
      on: (event: string, fn: () => void) => handlers.set(event, fn),
      off: (event: string) => handlers.delete(event),
    },
  ],
}));

const { BalanceCarousel } = await import("@/features/portfolio/components/balance-carousel");

function renderCarousel(card?: number) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <BalanceCarousel card={card}>
        <div>balance card</div>
        <div>kash card</div>
      </BalanceCarousel>
    </NextIntlClientProvider>
  );
}

beforeEach(() => {
  scrollTo.mockClear();
  handlers.clear();
});
afterEach(cleanup);

describe("BalanceCarousel", () => {
  it("draws every card it is given, with an indicator apiece", () => {
    renderCarousel();

    expect(screen.getByText("balance card")).toBeInTheDocument();
    expect(screen.getByText("kash card")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /card/i })).toHaveLength(2);
  });

  // The carousel existed long before anything drove it, and the desktop grid
  // and the reduced-motion path still use it that way.
  it("answers to swipes alone when nothing is driving it", () => {
    renderCarousel(undefined);

    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("goes to the card the page's scroll asks for", () => {
    const { rerender } = renderCarousel(0);
    rerender(
      <NextIntlClientProvider locale="en" messages={messages}>
        <BalanceCarousel card={1}>
          <div>balance card</div>
          <div>kash card</div>
        </BalanceCarousel>
      </NextIntlClientProvider>
    );

    expect(scrollTo).toHaveBeenCalledWith(1);
  });

  // The reason the component remembers what it was last asked for. The scroll
  // driver holds its answer steady through the middle of the hold, so a reader
  // who swipes back to the balance card would be dragged to Kash again on the
  // very next frame if a mere difference were enough to move the carousel.
  it("does not drag a swiped card back while the scroll keeps asking the same thing", () => {
    const { rerender } = renderCarousel(1);
    scrollTo.mockClear();

    // The same answer, several frames running — the reader is mid-hold.
    for (let i = 0; i < 3; i++) {
      rerender(
        <NextIntlClientProvider locale="en" messages={messages}>
          <BalanceCarousel card={1}>
            <div>balance card</div>
            <div>kash card</div>
          </BalanceCarousel>
        </NextIntlClientProvider>
      );
    }

    expect(scrollTo).not.toHaveBeenCalled();
  });

  // A jump would land on Kash with nothing to notice, and the whole point of
  // holding the page is that the reader sees the card travel.
  it("slides rather than jumping, so the move is visible", () => {
    const { rerender } = renderCarousel(0);
    rerender(
      <NextIntlClientProvider locale="en" messages={messages}>
        <BalanceCarousel card={1}>
          <div>balance card</div>
          <div>kash card</div>
        </BalanceCarousel>
      </NextIntlClientProvider>
    );

    // Embla's second argument is `jump`. Passing it as true would skip the
    // animation.
    expect(scrollTo).toHaveBeenCalledWith(1);
    expect(scrollTo.mock.calls[0][1]).toBeUndefined();
  });
});
