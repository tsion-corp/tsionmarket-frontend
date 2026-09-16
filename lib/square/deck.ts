/**
 * The people deck's geometry and swipe maths, carried over verbatim from the
 * Square (market-square-frontend/lib/deck-layout.ts and lib/swipe-deck.ts).
 *
 * The deck is drawn in the file's own units and scaled by one factor `k`,
 * chosen so the whole fan, arrows included, fits the column it is given.
 * Pure, so it can be pinned without a renderer.
 */

export interface DeckPlace {
  dx: number;
  dy: number;
  scale: number;
  rot: number;
  opacity: number;
}

export interface DeckNode {
  card: { width: number; height: number };
  fan: { left: number; right: number };
  arrow: { size: number; dy: number; leftDx: number; rightDx: number };
  places: Record<number, DeckPlace>;
  box?: { top: number; bottom: number };
  /** No card behind the front one's right edge and no right disc. */
  hideNext?: boolean;
}

/** Home's deck, node 647:16300: the front card with one behind on each side. */
export const HOME_DECK_NODE: DeckNode = {
  card: { width: 310.24, height: 422.24 },
  fan: { left: -386.05, right: 433.06 },
  arrow: { size: 64, dy: 15.88, leftDx: -357.17, rightDx: 412.83 },
  places: {
    [-1]: { dx: -212.47, dy: 5.71, scale: 0.9276, rot: -9.274, opacity: 0.2 },
    0: { dx: 0, dy: 0, scale: 1, rot: 0, opacity: 1 },
    1: { dx: 257.62, dy: 12.02, scale: 0.9276, rot: 9.904, opacity: 0.2 },
  },
  box: { top: -211.12, bottom: 229.7 },
};

/**
 * The deck as the Square page draws it, after the maintainer's change of
 * 2026-09-12: the cards behind the front one stay in the fan but are blurred
 * so the next person cannot be made out, the right disc is hidden, and the
 * fan is drawn tighter than Home's so the front card is larger. The reach on
 * each side is the same, so the front card's centre is the column's centre.
 *
 * In Home's units: the previous card and the left disc reach 300 to the
 * left, the next card 300 to the right, against Home's 389 and 445.
 */
/** The box a card of this size takes once turned by `deg`. */
export function rotatedBox(
  width: number,
  height: number,
  deg: number
): { width: number; height: number } {
  const t = Math.abs((deg * Math.PI) / 180);
  const c = Math.cos(t);
  const s = Math.sin(t);
  return { width: width * c + height * s, height: width * s + height * c };
}

const REACH = 300;

/** Where a back card sits so its rotated box ends exactly on the reach. */
function sideDx(place: DeckPlace, side: -1 | 1): number {
  const card = HOME_DECK_NODE.card;
  const box = rotatedBox(card.width * place.scale, card.height * place.scale, place.rot);
  return side * (REACH - box.width / 2);
}

export const SQUARE_DECK_NODE: DeckNode = {
  ...HOME_DECK_NODE,
  fan: { left: -REACH, right: REACH },
  arrow: {
    ...HOME_DECK_NODE.arrow,
    leftDx: -REACH + HOME_DECK_NODE.arrow.size / 2,
    rightDx: REACH - HOME_DECK_NODE.arrow.size / 2,
  },
  places: {
    [-1]: { ...HOME_DECK_NODE.places[-1], dx: sideDx(HOME_DECK_NODE.places[-1], -1) },
    0: HOME_DECK_NODE.places[0],
    1: { ...HOME_DECK_NODE.places[1], dx: sideDx(HOME_DECK_NODE.places[1], 1) },
  },
  hideNext: true,
};

export interface DeckLayout {
  k: number;
  frontX: number;
  height: number;
  frontY: number;
}

export function deckExtent(arrows: boolean, node: DeckNode): { left: number; right: number } {
  const discLeft = node.arrow.leftDx - node.arrow.size / 2;
  const discRight = node.arrow.rightDx + node.arrow.size / 2;
  return {
    left: arrows ? Math.min(node.fan.left, discLeft) : node.fan.left,
    right: arrows && !node.hideNext ? Math.max(node.fan.right, discRight) : node.fan.right,
  };
}

export function deckLayout({
  room,
  arrows,
  node,
}: {
  room: number;
  arrows: boolean;
  node: DeckNode;
}): DeckLayout {
  const extent = deckExtent(arrows, node);
  const k = room / (extent.right - extent.left);
  const top = node.box?.top ?? -node.card.height / 2;
  const bottom = node.box?.bottom ?? node.card.height / 2;
  return { k, frontX: -extent.left * k, frontY: -top * k, height: (bottom - top) * k };
}

// ── The swipe ───────────────────────────────────────────────────────────────

export const COMMIT_RATIO = 0.28;
export const FLICK_VELOCITY = 0.45;
export const MAX_ROTATION_DEG = 12;
export const HORIZONTAL_RATIO = 1.2;

/** On Home a rightward drag goes back and a leftward one goes on. */
export type SwipeDecision = "follow" | "pass" | null;

export function swipeProgress(dx: number, width: number): number {
  if (!Number.isFinite(dx) || !(width > 0)) return 0;
  return Math.max(-1, Math.min(1, dx / width));
}

export function swipeRotation(dx: number, width: number): number {
  return swipeProgress(dx, width) * MAX_ROTATION_DEG;
}

export function isHorizontalGesture(dx: number, dy: number): boolean {
  return Math.abs(dx) > Math.abs(dy) * HORIZONTAL_RATIO;
}

export function swipeDecision(input: {
  dx: number;
  dy: number;
  width: number;
  velocity?: number;
}): SwipeDecision {
  const { dx, dy, width, velocity = 0 } = input;
  if (!Number.isFinite(dx) || !(width > 0)) return null;
  if (!isHorizontalGesture(dx, dy)) return null;
  const far = Math.abs(dx) >= width * COMMIT_RATIO;
  const flicked = Math.abs(velocity) >= FLICK_VELOCITY && Math.sign(velocity) === Math.sign(dx);
  if (!far && !flicked) return null;
  return dx > 0 ? "follow" : "pass";
}

export function exitOffset(decision: Exclude<SwipeDecision, null>, width: number): number {
  return decision === "follow" ? width * 1.5 : -width * 1.5;
}
