import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import enMessages from "@/messages/en.json";
import type { PredictionSpot } from "@/features/discovery/types";
import { PredictionStartsRow } from "./prediction-starts-row";

// The row rides the shared carousel, which asks the browser for the
// reduced-motion preference and watches its own frame for resizes. jsdom ships
// neither, so both are stubbed as "no preference" and "never resizes".
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

afterEach(() => {
  vi.useRealTimers();
});

/*
 * The copy the design comp was drawn with, written out here rather than read
 * from the catalogue so the guard survives the keys being deleted.
 *
 * `discovery.predictionOneBody` was "ETH is up 3.5% in the last 6 hours. I
 * recommend increasing your position by 10%", and it was professionally
 * translated into all five locales. It invented a market figure no feed
 * produced, gave a personalised instruction to trade, and talked about ETH
 * under a headline about a person. `discovery.predictionCountdown` was a clock
 * face typed into the message catalogue, so the card counted down to a deadline
 * that did not exist. Nothing this row draws may match either of them.
 */
const COMP_COUNTDOWN = "01:46:55:22";
const COMP_MOVE = "3.5%";

// A fixed "now" and two deadlines measured from it, so the ticking chip renders
// a known clock instead of one that moves with the wall clock.
const NOW = Date.UTC(2026, 8, 9, 12, 0, 0);
const FIRST_REMAINING = "02:11:04:09";
const SECOND_REMAINING = "00:03:21:44";
const asMs = (clock: string) => {
  const [d, h, m, sec] = clock.split(":").map(Number);
  return ((d * 24 + h) * 60 * 60 + m * 60 + sec) * 1000;
};

// The chip counts down, so advancing the rotation by ten seconds also takes ten
// seconds off the clock. Expected values are therefore read at the current fake
// time rather than written out, which is the point: a chip that still printed
// its opening value after a tick would be the frozen clock this replaced.
const clockNow = (spot: PredictionSpot) => {
  const remaining = Math.max(0, (spot.closesAt as number) - Date.now());
  const total = Math.floor(remaining / 1000);
  const pad = (value: number) => String(value).padStart(2, "0");
  return [
    pad(Math.floor(total / 86_400)),
    pad(Math.floor((total % 86_400) / 3_600)),
    pad(Math.floor((total % 3_600) / 60)),
    pad(total % 60),
  ].join(":");
};

const first: PredictionSpot = {
  id: "market-1",
  question: "Will Benny Hinn hold a crusade in Lagos this year?",
  closesAt: NOW + asMs(FIRST_REMAINING),
  images: ["/market/prediction-event-back.png", "/market/prediction-event-front.png"],
  href: "/prediction/markets/908212?category=culture",
};

const second: PredictionSpot = {
  id: "market-2",
  question: "Will the Super Eagles reach the final?",
  closesAt: NOW + asMs(SECOND_REMAINING),
  images: ["/market/second-back.png", "/market/second-front.png"],
  href: "/prediction/markets/551900?category=sports",
};

function renderRow(markets?: readonly PredictionSpot[]) {
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <PredictionStartsRow markets={markets} />
    </NextIntlClientProvider>
  );
}

/** Every word on the shelf, however many times the carousel drew it. */
function rowText(): string {
  return document.body.textContent ?? "";
}

/** Every image the shelf drew, artwork and market photos alike. */
function rowImages(): string[] {
  return Array.from(document.querySelectorAll("img")).map((img) => img.getAttribute("src") ?? "");
}

function tick(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

describe("prediction starts row", () => {
  it("opens the featured market from a link named after its question", () => {
    renderRow([first]);

    // The card is dealt twice into the carousel, so both copies carry the link.
    const links = screen.getAllByRole("link", { name: first.question });
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link).toHaveAttribute("href", first.href);
    }
  });

  it("puts the card link in the tab order and activates it with Enter", () => {
    renderRow([first]);

    const link = screen.getAllByRole("link", { name: first.question })[0];
    // A real anchor with an href is tab reachable and Enter-activated by the
    // browser, so the test's job is to prove it is one and that nothing has
    // pulled it out of the tab order.
    expect(link.tagName).toBe("A");
    expect(link).not.toHaveAttribute("tabindex", "-1");
    expect(link).not.toHaveAttribute("aria-hidden");

    link.focus();
    expect(link).toHaveFocus();
  });

  // The white bar holds two pills that are links themselves. Nesting them in
  // the card's link would be invalid markup and would drop them out of the tab
  // order, so the card link is stretched over the card as a sibling instead.
  it("keeps the card's own pills outside the card link", () => {
    renderRow([first]);

    const card = screen.getAllByRole("link", { name: first.question })[0].closest("article");
    expect(card).not.toBeNull();

    const cardLink = within(card as HTMLElement).getByRole("link", { name: first.question });
    const predictNow = within(card as HTMLElement).getAllByRole("link", { name: /Predict Now/i });
    expect(predictNow.length).toBeGreaterThan(0);
    for (const pill of predictNow) {
      expect(cardLink).not.toContainElement(pill);
    }
  });

  it("offers one way in, Predict Now, and no pill back to the desk", () => {
    renderRow([first]);

    const card = screen.getAllByRole("link", { name: first.question })[0].closest("article");
    const pills = within(card as HTMLElement)
      .getAllByRole("link")
      .filter((link) => link.getAttribute("aria-label") !== first.question);
    expect(pills.map((pill) => pill.textContent)).toEqual([expect.stringMatching(/Predict Now/i)]);
  });

  it("falls back to the prediction desk when no market has reached the row", () => {
    renderRow();

    const sample = enMessages.discovery.predictionOneTitle;
    for (const link of screen.getAllByRole("link", { name: sample })) {
      expect(link).toHaveAttribute("href", "/prediction");
    }
  });

  it("gives no advice and quotes no invented figure under a live market", () => {
    renderRow([first, second]);

    expect(rowText()).not.toMatch(/recommend/i);
    expect(rowText()).not.toMatch(/increas/i);
    expect(rowText()).not.toMatch(/6 hours/);
    expect(rowText()).not.toContain(COMP_MOVE);
  });

  it("gives no advice and quotes no invented figure on the sample card either", () => {
    renderRow();

    expect(rowText()).not.toMatch(/recommend/i);
    expect(rowText()).not.toMatch(/increas/i);
    expect(rowText()).not.toMatch(/6 hours/);
    expect(rowText()).not.toContain(COMP_MOVE);
  });

  it("prints the market's own countdown", () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    renderRow([first]);

    expect(screen.getAllByText(clockNow(first)).length).toBeGreaterThan(0);
    expect(rowText()).not.toContain(COMP_COUNTDOWN);
  });

  it("counts down to nothing when no market has reached the row", () => {
    renderRow();

    // No market means no close time, and a clock face typed into the catalogue
    // is not one. The chip stays, because the card's geometry starts at it, and
    // says what it knows.
    expect(rowText()).not.toContain(COMP_COUNTDOWN);
    expect(screen.getAllByText(enMessages.discovery.predictionNoDeadline).length).toBeGreaterThan(
      0
    );
  });

  it("says it has no deadline rather than inventing one for a market without a close time", () => {
    renderRow([{ ...first, closesAt: null }]);

    expect(rowText()).not.toContain(COMP_COUNTDOWN);
    expect(screen.getAllByText(enMessages.discovery.predictionNoDeadline).length).toBeGreaterThan(
      0
    );
  });

  it("moves to the next market every ten seconds, carrying its words and its photos", () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    renderRow([first, second]);

    expect(screen.getAllByRole("link", { name: first.question }).length).toBeGreaterThan(0);
    expect(screen.getAllByText(clockNow(first)).length).toBeGreaterThan(0);
    expect(rowImages()).toContain(first.images[0]);
    expect(rowImages()).not.toContain(second.images[0]);

    tick(10_000);

    // The whole card follows the market: question, countdown, photos, and where
    // it leads. Not the headline alone.
    expect(screen.queryAllByRole("link", { name: first.question })).toHaveLength(0);
    const links = screen.getAllByRole("link", { name: second.question });
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link).toHaveAttribute("href", second.href);
    }
    expect(screen.getAllByText(clockNow(second)).length).toBeGreaterThan(0);
    expect(rowImages()).toContain(second.images[0]);
    expect(rowImages()).not.toContain(first.images[0]);

    tick(10_000);

    // And back round.
    expect(screen.getAllByRole("link", { name: first.question }).length).toBeGreaterThan(0);
  });

  // WCAG 2.2.2 (Pause, Stop, Hide). The card changes itself every ten seconds
  // and runs longer than five, so a reader must be able to hold it still.
  it("holds the rotation while the pointer is over the card", () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    renderRow([first, second]);

    const card = screen.getAllByRole("link", { name: first.question })[0].closest("article");
    expect(card).not.toBeNull();

    fireEvent.pointerOver(card as HTMLElement);
    tick(30_000);
    expect(screen.getAllByRole("link", { name: first.question }).length).toBeGreaterThan(0);

    // Letting go resumes from where it was held rather than catching up.
    fireEvent.pointerOut(card as HTMLElement);
    tick(10_000);
    expect(screen.getAllByRole("link", { name: second.question }).length).toBeGreaterThan(0);
  });

  it("holds the rotation while something inside the card has focus", () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    renderRow([first, second]);

    const link = screen.getAllByRole("link", { name: first.question })[0];
    act(() => link.focus());
    tick(30_000);
    expect(screen.getAllByRole("link", { name: first.question }).length).toBeGreaterThan(0);

    act(() => link.blur());
    tick(10_000);
    expect(screen.getAllByRole("link", { name: second.question }).length).toBeGreaterThan(0);
  });

  it("runs no timer for a single market rather than padding the rotation", () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    renderRow([first]);

    tick(60_000);

    expect(screen.getAllByRole("link", { name: first.question }).length).toBeGreaterThan(0);
    expect(rowImages()).not.toContain(second.images[0]);
  });
});
