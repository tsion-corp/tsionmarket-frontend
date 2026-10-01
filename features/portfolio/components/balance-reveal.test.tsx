import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { BalanceReveal } from "@/features/portfolio/components/balance-reveal";

// This file exists because the maths being right was not enough.
//
// `revealProgress` changed shape from (elementTop, headerOffset, distance) to
// (scrollY, start, distance). Both are three numbers, so the compiler was
// content while the component handed it an element's viewport top where a page
// offset belonged — and a viewport top DECREASES as the reader scrolls down,
// so the reveal ran backwards. Every pure test still passed. The only thing
// that catches that is wiring the component to a moving page.
//
// jsdom does not scroll, so the page is simulated: `scrollY` is stubbed and the
// block reports a rect derived from it, exactly as a real element would.

const BLOCK_TOP = 110; // the block's offset down the document
const VIEWPORT = 844;

function scrollTo(y: number) {
  Object.defineProperty(window, "scrollY", { value: y, configurable: true });
  window.dispatchEvent(new Event("scroll"));
}

let cards: (number | undefined)[] = [];

function renderReveal() {
  cards = [];
  return render(
    <BalanceReveal>
      {(card) => {
        cards.push(card);
        return <div data-testid="cards">{String(card)}</div>;
      }}
    </BalanceReveal>
  );
}

/** What the reveal is asking for right now. */
const shown = () => cards.at(-1);

beforeEach(() => {
  Object.defineProperty(window, "innerHeight", { value: VIEWPORT, configurable: true });
  Object.defineProperty(window, "scrollY", { value: 0, configurable: true });
  // A real element's rect top is its document offset minus how far the page has
  // scrolled. Reproducing that relationship is the whole point of this harness.
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    () => ({ top: BLOCK_TOP - window.scrollY, height: 200 }) as DOMRect
  );
  // Run the animation frame straight away so a scroll event settles inside act.
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    cb(0);
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("BalanceReveal", () => {
  it("shows the balance card before the reader has scrolled", () => {
    renderReveal();

    expect(shown()).not.toBe(1);
  });

  // THE regression. Scrolling down must move toward Kash. The version this
  // test was written against did the opposite, because it measured a rect that
  // moves under the measurement.
  it("turns toward Kash as the reader scrolls down, never away", () => {
    renderReveal();

    act(() => scrollTo(60));

    expect(shown()).toBe(1);
  });

  // "Across before down": the swap must be finished before the page has moved
  // far enough to read as movement. Twenty pixels is about that point.
  it("has turned over before the page has visibly moved", () => {
    renderReveal();

    act(() => scrollTo(20));

    expect(shown()).toBe(1);
  });

  // The complaint that produced this file: the card turned over only after the
  // block had half gone under the header, so the Kash balance arrived already
  // leaving. The block sits 110px down and the header covers 64px, so it starts
  // disappearing at scrollY 46. It must have turned by then.
  it("turns over long before the block reaches the header", () => {
    renderReveal();

    // Half way to the point the block starts disappearing.
    act(() => scrollTo(Math.floor((BLOCK_TOP - 64) / 2)));

    expect(shown()).toBe(1);
  });

  it("brings the balance card back on the way up", () => {
    renderReveal();
    act(() => scrollTo(120));
    expect(shown()).toBe(1);

    act(() => scrollTo(0));

    expect(shown()).toBe(0);
  });

  // Monotonic: every step further down either keeps Kash or arrives at it.
  // A mapping that ran backwards would show 1 then 0 across this sweep.
  it("never turns back to the balance card while the reader keeps scrolling down", () => {
    renderReveal();

    const seen: (number | undefined)[] = [];
    for (let y = 0; y <= 200; y += 10) {
      act(() => scrollTo(y));
      seen.push(shown());
    }

    expect(seen.at(-1)).toBe(1);
    const firstKash = seen.indexOf(1);
    expect(firstKash).toBeGreaterThanOrEqual(0);
    expect(seen.slice(firstKash).every((c) => c === 1)).toBe(true);
  });

  // The house rule in globals.css: under reduced motion nothing may move. The
  // carousel is left to answer to swipes alone, which is what `undefined` means
  // to it.
  it("drives nothing under reduced motion", () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: true,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    renderReveal();

    act(() => scrollTo(200));

    expect(shown()).toBeUndefined();
  });

  it("adds no wrapper that could push the promo strip down", () => {
    const { container } = renderReveal();

    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.className).toBe("");
    expect(wrapper.getAttribute("style")).toBeNull();
  });
});
