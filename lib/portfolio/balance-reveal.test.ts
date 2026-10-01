import { describe, expect, it } from "vitest";
import {
  cardForProgress,
  revealDistance,
  revealProgress,
  revealStart,
} from "@/lib/portfolio/balance-reveal";

// jsdom does not scroll, so this is where the scroll behaviour is actually
// proved. The component below it only wires these answers to a carousel.

describe("revealDistance", () => {
  // The requirement is "across before down". The swap has to be over before
  // the page has moved far enough for the eye to call it movement.
  it("is over within a dozen or two pixels", () => {
    for (const vh of [320, 600, 844, 1200]) {
      expect(revealDistance(vh)).toBeLessThanOrEqual(24);
    }
  });

  // Not zero, and not one: a threshold that fired on a stray pixel would turn
  // the card over when someone brushed the screen.
  it("still needs a deliberate scroll, not a brush", () => {
    for (const vh of [320, 600, 844, 1200]) {
      expect(revealDistance(vh)).toBeGreaterThanOrEqual(12);
    }
  });

  it("never asks for nothing", () => {
    expect(revealDistance(0)).toBeGreaterThan(0);
  });
});

describe("revealStart", () => {
  const HEADER = 64;
  const VIEWPORT = 844;

  // The correction this replaced: positioning the reveal to END at the header
  // meant that on a block 110px down it did not BEGIN until 29px of scrolling
  // had already happened. The page moved before the card did, which is the
  // order the maintainer does not want.
  it("begins at the first pixel when the block is already on screen", () => {
    expect(revealStart(110, HEADER, VIEWPORT, 17)).toBe(0);
    expect(revealStart(0, HEADER, VIEWPORT, 17)).toBe(0);
    expect(revealStart(VIEWPORT, HEADER, VIEWPORT, 17)).toBe(0);
  });

  // Not this page today, but the component cannot assume that. A block below
  // the fold waits until it is near the header, so a reader still meets the
  // balance card rather than finding Kash already showing.
  it("waits for a block that starts below the fold", () => {
    const start = revealStart(2000, HEADER, VIEWPORT, 17);

    expect(start).toBe(2000 - HEADER - 17);
    expect(start + 17).toBe(2000 - HEADER);
  });

  it("never asks the reader to scroll upwards to begin", () => {
    for (const top of [0, 10, 64, 100, 500, 5000]) {
      expect(revealStart(top, HEADER, VIEWPORT, 17)).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("revealProgress", () => {
  const DISTANCE = 48;
  const START = 120;

  it("is nothing before the reveal begins", () => {
    expect(revealProgress(0, START, DISTANCE)).toBe(0);
    expect(revealProgress(START, START, DISTANCE)).toBe(0);
  });

  it("runs from nothing to whole across the distance", () => {
    expect(revealProgress(START + 24, START, DISTANCE)).toBeCloseTo(0.5);
    expect(revealProgress(START + DISTANCE, START, DISTANCE)).toBe(1);
  });

  it("never escapes 0 to 1", () => {
    for (const y of [-9999, 0, START, START + 1, START + DISTANCE, 99999]) {
      const p = revealProgress(y, START, DISTANCE);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
    }
  });

  it("answers nothing rather than dividing by a distance of zero", () => {
    expect(revealProgress(500, START, 0)).toBe(0);
  });
});

// The behaviour the maintainer described, end to end, in the geometry this
// page actually has: a block 110px down the document, a 64px header, an 844px
// phone. The card must go across before the page goes down.
describe("the reveal a reader actually gets", () => {
  const HEADER = 64;
  const BLOCK_TOP = 110;
  const DISTANCE = revealDistance(844);
  const START = revealStart(BLOCK_TOP, HEADER, 844, DISTANCE);

  function cardAt(scrollY: number, current = 0) {
    return cardForProgress(revealProgress(scrollY, START, DISTANCE), current);
  }

  it("shows the balance card before the reader has scrolled", () => {
    expect(cardAt(0)).toBe(0);
  });

  // "Across before down". Twenty pixels is about the point a scroll starts to
  // look like one; the card has to have turned by then.
  it("has turned over before the page has visibly moved", () => {
    let card = 0;
    for (let y = 0; y <= 20; y++) card = cardAt(y, card);

    expect(card).toBe(1);
  });

  // The complaint that came before this one: the card turned over only after
  // the block had half gone under the header. The block sits 110px down and the
  // header covers 64px, so it starts disappearing at scrollY 46 — by which
  // point the swap is now long finished.
  it("turns over far before the block reaches the header", () => {
    const underHeaderAt = BLOCK_TOP - HEADER;
    let card = 0;
    for (let y = 0; y <= Math.floor(underHeaderAt / 2); y++) card = cardAt(y, card);

    expect(card).toBe(1);
  });

  // Scrolling back up returns them in the order asked for: Kash first, then
  // the balance.
  it("comes back the way it went", () => {
    let card = 0;
    for (let y = 0; y <= 120; y++) card = cardAt(y, card);
    expect(card).toBe(1);

    for (let y = 120; y >= 0; y--) card = cardAt(y, card);
    expect(card).toBe(0);
  });
});

describe("cardForProgress", () => {
  it("shows the balance at the start and Kash at the end", () => {
    expect(cardForProgress(0, 0)).toBe(0);
    expect(cardForProgress(1, 0)).toBe(1);
  });

  // The reason this takes `current` at all. A finger resting near the midpoint
  // jitters by a pixel, and a bare `progress > 0.5` would swap the card back
  // and forth on that jitter.
  it("holds whatever is on screen through the middle band", () => {
    expect(cardForProgress(0.5, 0)).toBe(0);
    expect(cardForProgress(0.5, 1)).toBe(1);
    expect(cardForProgress(0.45, 1)).toBe(1);
    expect(cardForProgress(0.55, 0)).toBe(0);
  });

  it("commits once the reader is clearly past the band", () => {
    expect(cardForProgress(0.61, 0)).toBe(1);
    expect(cardForProgress(0.39, 1)).toBe(0);
  });

  // A swipe is allowed to win until the scroll passes a threshold of its own,
  // so a reader who swiped to Kash at the top of the page keeps Kash.
  it("leaves a swiped card alone inside the band", () => {
    expect(cardForProgress(0.1, 1)).toBe(0);
    expect(cardForProgress(0.5, 1)).toBe(1);
  });
});
