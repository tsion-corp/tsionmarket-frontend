import type { PieceType } from "@/lib/casino/chess/engine";

// Staunton piece shapes drawn on the standard 45x45 chess viewBox. Every piece
// stands on the same two-tier base and bottoms out at y 39, so a rank lines up.
//
// `body` shapes are filled in the piece's colour and outlined in the opposite
// one, so the same art reads on a light or a dark square. `detail` is stroked
// only: the slit on the bishop, the knight's eye and mane. Drawn by hand rather
// than taken from a set, so no third-party licence rides along with the board.
export interface PieceArt {
  body: string[];
  detail?: string[];
}

// The foot, and the narrower band that sits on it. Two tiers rather than one
// slab is most of what makes a piece look turned rather than cut out.
const FOOT = "M9.9,38.9c0.1,-2 1.2,-3.2 2.9,-3.7h19.4c1.7,0.5 2.8,1.7 2.9,3.7z";
const PLINTH = "M13.2,35.2c0,-1.6 0.6,-2.6 1.6,-3.2h15.4c1,0.6 1.6,1.6 1.6,3.2z";
const BASE = [PLINTH, FOOT];

export const PIECE_ART: Record<PieceType, PieceArt> = {
  p: {
    body: [
      // Ball head, collar, then an ogee body that flares onto the base.
      "M22.5,6.7a3.9,3.9 0 1,0 0,7.8a3.9,3.9 0 1,0 0,-7.8z",
      "M18.8,14.9h7.4l-0.9,2.2h-5.6z",
      "M20.1,17.1c-1.9,1.6-3.2,3.9-3.2,6.4 0,3.6-1.4,6.4-3.6,8.5h18.4c-2.2,-2.1-3.6,-4.9-3.6,-8.5 0,-2.5-1.3,-4.8-3.2,-6.4z",
      ...BASE,
    ],
  },

  r: {
    body: [
      // Four merlons, a collar, then a tower with a flared foot.
      "M11.8,12.6h4v3.3h1.9v-3.3h3.9v3.3h1.9v-3.3h3.9v3.3h1.9v-3.3h4v7.9h-21.5z",
      "M13.6,20.5h17.8l-1.5,2.4h-14.8z",
      "M15.1,22.9h14.8v6.4c0,1.2 0.5,2 1.5,2.7h-17.8c1,-0.7 1.5,-1.5 1.5,-2.7z",
      ...BASE,
    ],
  },

  n: {
    body: [
      // Horse's head in profile: crest and neck down the right, jaw and muzzle
      // back up the left, ear closing to the start.
      "M21.2,8.6c3.8,-1.1 7.6,0.9 9.4,4.2 1.8,3.3 2.2,7.4 2.2,11.6 0,3.1-0.4,5.6-1,7.6h-18.6c-0.4,-3.6 1,-6.6 3.6,-8.7 2,-1.6 3.9,-2.7 5.2,-4.6 -1.9,1-4,2-6.1,2 -2.4,0-3.8,-2-3,-4 0.7,-1.9 2.3,-3.2 3.8,-4.5l-1.7,-1.9c0.9,-1.9 2.9,-2.7 4.7,-1.7z",
      ...BASE,
    ],
    detail: ["M19.3,13.7a0.95,0.95 0 1,0 0.01,0z", "M27.4,11.6c1.9,2.7 2.8,6.4 3,10.8"],
  },

  b: {
    body: [
      "M22.5,5.6a2.1,2.1 0 1,0 0,4.2a2.1,2.1 0 1,0 0,-4.2z",
      "M22.5,10.2c-4,3.3-6.8,7.5-6.8,11.5 0,2.5 1.3,4.5 3.1,5.7h7.4c1.8,-1.2 3.1,-3.2 3.1,-5.7 0,-4-2.8,-8.2-6.8,-11.5z",
      "M16.4,27.4h12.2l-1,2.3h-10.2z",
      "M15.4,29.7h14.2c1.4,0.8 2.2,1.4 2.9,2.3h-20c0.7,-0.9 1.5,-1.5 2.9,-2.3z",
      ...BASE,
    ],
    detail: ["M22.5,13.8v7.6", "M18.9,17.6h7.2"],
  },

  q: {
    body: [
      // Five points, each tipped with a ball, over the coronet.
      "M11.2,11a1.9,1.9 0 1,0 0,3.8a1.9,1.9 0 1,0 0,-3.8z",
      "M17,8.7a1.9,1.9 0 1,0 0,3.8a1.9,1.9 0 1,0 0,-3.8z",
      "M22.5,7.7a2,2 0 1,0 0,4a2,2 0 1,0 0,-4z",
      "M28,8.7a1.9,1.9 0 1,0 0,3.8a1.9,1.9 0 1,0 0,-3.8z",
      "M33.8,11a1.9,1.9 0 1,0 0,3.8a1.9,1.9 0 1,0 0,-3.8z",
      "M11.2,14.8l3,11.4h16.6l3,-11.4 -5.6,7 -2.8,-8.8 -2.9,9 -2.9,-9 -2.8,8.8z",
      "M14.2,26.2h16.6l0.9,2.4h-18.4z",
      "M13.7,28.6h17.6c0.8,1.2 1.4,2.2 1.7,3.4h-21c0.3,-1.2 0.9,-2.2 1.7,-3.4z",
      ...BASE,
    ],
  },

  k: {
    body: [
      // A solid cross reads far better at board size than a stroked one, then
      // the crown band, then the bell that flares onto the base.
      "M21.2,5.2h2.6v3h3v2.6h-3v3.4h-2.6v-3.4h-3v-2.6h3z",
      "M16.9,14.3h11.2c-0.3,2.1-0.8,3.9-1.3,5.4h-8.6c-0.5,-1.5-1,-3.3-1.3,-5.4z",
      "M18.6,19.7c-2.2,1.7-3.7,4.1-4.2,6.9 -0.3,2-0.9,3.8-1.8,5.4h19.8c-0.9,-1.6-1.5,-3.4-1.8,-5.4 -0.5,-2.8-2,-5.2-4.2,-6.9z",
      ...BASE,
    ],
  },
};

// Text glyphs for the captured-pieces line under each player.
export const PIECE_GLYPHS: Record<PieceType, string> = {
  p: "♟",
  n: "♞",
  b: "♝",
  r: "♜",
  q: "♛",
  k: "♚",
};
