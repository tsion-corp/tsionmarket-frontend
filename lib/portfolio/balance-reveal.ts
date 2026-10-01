// The maths behind the phone portfolio's scroll-driven balance cards.
//
// The two cards used to be reachable only by swiping sideways, which is a
// gesture a reader has to already know about. They now also turn over with the
// scroll the reader is doing anyway: Kash on the way down, the balance card
// again on the way back up.
//
// Two earlier attempts are worth knowing about, because the shape of this one
// is a reaction to both.
//
// The first pinned the block and gave it a runway of empty scroll to be held
// through — the literal reading of "the page pauses while the card slides". It
// worked, and it cost what any pin costs: holding the page means adding scroll
// distance, adding scroll distance means adding page height, and that height
// showed as a band of empty space between the cards and the promo strip.
//
// The second dropped the pin but measured the reveal from the moment the block
// passed under the header, over about a fifth of the viewport. That put the
// whole move too late and made it too slow: by the time the card turned over,
// half the block had already gone under the header, so the Kash card arrived
// already leaving and its balance could not be read. Which is the entire point
// of showing it.
//
// The third finished in a few dozen pixels, which was much better but still
// let the block move perceptibly before the card turned over.
//
// So the reveal is now measured in PAGE scroll rather than against a viewport
// landmark, and it is over in about a dozen pixels — before the page has moved
// far enough to notice. That is the ordering the maintainer asked for ("across
// before down") bought with speed rather than with the page height a real hold
// would have cost.
//
// Pure on purpose, and kept out of the component for the reason
// lib/landing/journey.ts is: jsdom does not scroll, so the only way to test a
// scroll mapping honestly is to make it arithmetic and test the arithmetic.
// Nothing here reads the DOM, a clock, or the window.

/**
 * How much scrolling turns the card over, in pixels.
 *
 * Tiny, and that is the whole design. The maintainer's requirement is that the
 * card goes ACROSS before the page goes DOWN — and holding the page still to
 * make room for that is not free. Something has to occupy the held distance:
 * either empty space, which is the band that appeared between the cards and the
 * promo strip the first time this was built, or content, which would mean the
 * banners sliding up behind the cards and being eaten.
 *
 * So the hold is replaced by speed. At roughly a dozen pixels the swap fires on
 * the first movement of any real gesture — before the page has travelled far
 * enough for the eye to register it as having moved, and long before the block
 * reaches the header. The ordering the maintainer asked for, without buying it
 * with layout.
 *
 * Not zero, and not one: a threshold that fires on a single stray pixel would
 * turn the card over when someone brushes the screen. This is the smallest
 * distance that still reads as a deliberate scroll.
 */
export function revealDistance(viewportHeight: number): number {
  const proportional = Math.round(viewportHeight * 0.02);
  return Math.min(24, Math.max(12, proportional));
}

/**
 * The scroll position the reveal begins at.
 *
 * Zero whenever the block is already on screen when the page is at rest, which
 * on the portfolio it always is — the cards are the first thing under the
 * header. That is what makes the swap fire on the FIRST pixels of a scroll
 * rather than partway down: there is nothing to wait for when the thing is
 * already in front of the reader.
 *
 * An earlier version positioned the reveal to end as the block reached the
 * header, which on a block 110px down meant it did not begin until 29px of
 * scrolling had already happened. The page had moved before the card did,
 * which is precisely the order the maintainer does not want.
 *
 * The other branch is for a block that starts below the fold — not this page
 * today, but the component does not get to assume that. There the reveal waits
 * until the block is close to the header, so a reader still meets the balance
 * card before it turns over rather than finding Kash already showing.
 *
 * `blockTop` is the block's offset from the top of the DOCUMENT, which is
 * stable no matter where the page is scrolled to — unlike a viewport rect,
 * which changes under the very thing being measured.
 */
export function revealStart(
  blockTop: number,
  headerOffset: number,
  viewportHeight: number,
  distance: number
): number {
  if (blockTop <= viewportHeight) return 0;
  return Math.max(0, blockTop - headerOffset - distance);
}

/**
 * How far through the reveal the reader is, from 0 to 1.
 *
 * Clamped at both ends. Before it the answer is 0 and after it is 1; the caller
 * should not have to range-check a number that is only ever used to choose
 * between two cards.
 */
export function revealProgress(scrollY: number, start: number, distance: number): number {
  if (distance <= 0) return 0;
  const travelled = scrollY - start;
  if (travelled <= 0) return 0;
  if (travelled >= distance) return 1;
  return travelled / distance;
}

/**
 * Which card the scroll is asking for, given where the reader already is.
 *
 * Deliberately not a bare `progress > 0.5`. A finger resting at the midpoint
 * jitters by a pixel either way, and a threshold with no memory would flip the
 * card back and forth on that jitter. The card moves forward at 0.6 and back
 * at 0.4, so the 0.2 between them is a band where whatever is on screen stays
 * on screen.
 *
 * `current` is what the carousel is showing, which is not always what this
 * function last returned: the reader can still swipe, and a swipe is allowed to
 * win until the scroll passes a threshold of its own.
 */
export function cardForProgress(progress: number, current: number): number {
  if (progress >= 0.6) return 1;
  if (progress <= 0.4) return 0;
  return current;
}

/** The two card indexes this mapping can produce, for a caller that wants to be explicit. */
export const BALANCE_CARD = { balance: 0, kash: 1 } as const;
