import { describe, expect, it } from "vitest";
import {
  HOME_DECK_NODE,
  SQUARE_DECK_NODE,
  deckExtent,
  deckLayout,
  rotatedBox,
  swipeDecision,
} from "@/lib/square/deck";

// The deck is the Square's; these pin the two facts the page leans on: the
// whole fan, arrows included, fits the column it is given, and a drag only
// commits once it is far or fast enough, and only sideways.
describe("deckLayout", () => {
  it("scales the fan so the arrows' outer edges land on the column's edges", () => {
    const layout = deckLayout({ room: 1000, arrows: true, node: HOME_DECK_NODE });
    const { left, right } = deckExtent(true, HOME_DECK_NODE);
    // On Home the left disc reaches past the fan, and so does the right one.
    expect(left).toBe(HOME_DECK_NODE.arrow.leftDx - HOME_DECK_NODE.arrow.size / 2);
    expect(right).toBe(HOME_DECK_NODE.arrow.rightDx + HOME_DECK_NODE.arrow.size / 2);
    expect(layout.k).toBeCloseTo(1000 / (right - left), 6);
    expect(layout.frontX).toBeCloseTo(-left * layout.k, 6);
    expect(layout.height).toBeCloseTo((229.7 + 211.12) * layout.k, 6);
  });
});

// The maintainer's change of 2026-09-12: the next person is not shown and
// the right disc is hidden, so the fan ends at the front card's own edge and
// the card takes the room that frees up.
describe("the deck without a next card", () => {
  it("keeps both side cards, drops the right disc, and sits the front card centred", () => {
    const { left, right } = deckExtent(true, SQUARE_DECK_NODE);
    expect(right).toBeCloseTo(-left, 6);
    const home = deckLayout({ room: 600, arrows: true, node: HOME_DECK_NODE });
    const square = deckLayout({ room: 600, arrows: true, node: SQUARE_DECK_NODE });
    expect(square.frontX).toBeCloseTo(300, 6);
    // The fan is drawn tighter than Home's, so the front card is larger.
    expect(square.k).toBeGreaterThan(home.k * 1.3);
    expect(SQUARE_DECK_NODE.hideNext).toBe(true);
    // Each back card's rotated box ends on the reach, so nothing is cut.
    for (const side of [-1, 1] as const) {
      const place = SQUARE_DECK_NODE.places[side];
      const box = rotatedBox(
        SQUARE_DECK_NODE.card.width * place.scale,
        SQUARE_DECK_NODE.card.height * place.scale,
        place.rot
      );
      expect(place.dx + (side * box.width) / 2).toBeCloseTo(side * 300, 6);
    }
  });
});

describe("swipeDecision", () => {
  it("goes back on a far drag right and on on a far drag left", () => {
    expect(swipeDecision({ dx: 120, dy: 4, width: 300 })).toBe("follow");
    expect(swipeDecision({ dx: -120, dy: 4, width: 300 })).toBe("pass");
  });

  it("commits a short flick in its own direction, and nothing vertical", () => {
    expect(swipeDecision({ dx: 30, dy: 2, width: 300, velocity: 0.6 })).toBe("follow");
    expect(swipeDecision({ dx: 30, dy: 2, width: 300, velocity: -0.6 })).toBeNull();
    expect(swipeDecision({ dx: 30, dy: 200, width: 300 })).toBeNull();
    expect(swipeDecision({ dx: 30, dy: 2, width: 300 })).toBeNull();
  });
});
