import type { PieceType } from "@/lib/casino/chess/engine";

// Flat SVG silhouettes drawn on a 45x45 viewBox, one path per piece type.
export const PIECE_PATHS: Record<PieceType, string> = {
  k: "M12,36 L33,36 L30,30 L15,30 Z M15,30 L30,30 L27,18 L18,18 Z M18,18 L27,18 L27,14 L18,14 Z M21.5,6 L23.5,6 L23.5,14 L21.5,14 Z M19,8 L26,8 L26,10 L19,10 Z",
  q: "M13,36 L32,36 L29,29 L16,29 Z M16,29 L29,29 L26,20 L19,20 Z M18,20 L27,20 L27,17 L24,20 L22.5,15 L21,20 L18,17 Z M22.5,10 m-2,0 a2,2 0 1,0 4,0 a2,2 0 1,0 -4,0",
  r: "M14,36 L31,36 L31,32 L14,32 Z M16,32 L29,32 L29,20 L16,20 Z M15,20 L15,14 L18,14 L18,17 L21,17 L21,14 L24,14 L24,17 L27,17 L27,14 L30,14 L30,20 Z",
  b: "M14,36 L31,36 L28,32 L17,32 Z M18,32 C18,32 17,24 22.5,20 C28,24 27,32 27,32 Z M22.5,20 C19,17 19,12 22.5,9 C26,12 26,17 22.5,20 Z M22.5,7 m-1.6,0 a1.6,1.6 0 1,0 3.2,0 a1.6,1.6 0 1,0 -3.2,0",
  n: "M14,36 L31,36 L31,30 C31,30 30,26 27,25 L27,20 C27,16 24,12 20,11 C17,10 14,11 13,14 C12,16 13,18 15,18 C15,18 14,15 16,14 C18,13 19,15 18,17 C17,19 14,20 13,23 C12,26 14,28 17,28 L17,30 L14,30 Z",
  p: "M22.5,10 m-4,0 a4,4 0 1,0 8,0 a4,4 0 1,0 -8,0 M18,18 C18,15 20,14 22.5,14 C25,14 27,15 27,18 C27,21 24,23 24,25 L21,25 C21,23 18,21 18,18 Z M16,36 L29,36 L27,26 L18,26 Z",
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
