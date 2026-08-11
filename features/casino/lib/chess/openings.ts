// Opening identification from a game's move list. Chess openings are factual —
// a named sequence of moves — so this is a small curated table, not a copied
// asset: the defining line of each common opening keyed by its SAN moves, with
// the ECO code the wider chess world uses. `identifyOpening` returns the
// longest-matching named line, the way a board shows "Sicilian Defense: Najdorf"
// as the moves that define it are played.

export interface Opening {
  eco: string;
  name: string;
}

// Keyed by the space-joined SAN of the defining line. Ordered roughly shallow to
// deep; the matcher prefers the longest match, so a deeper entry wins over the
// broad family it sits inside.
const OPENINGS: Record<string, Opening> = {
  // --- 1. e4 ---
  e4: { eco: "B00", name: "King's Pawn Opening" },
  "e4 e5": { eco: "C20", name: "King's Pawn Game" },
  "e4 e5 Nf3": { eco: "C40", name: "King's Knight Opening" },
  "e4 e5 Nf3 Nc6": { eco: "C44", name: "King's Knight: Normal Variation" },
  "e4 e5 Nf3 Nc6 Bb5": { eco: "C60", name: "Ruy López" },
  "e4 e5 Nf3 Nc6 Bb5 a6": { eco: "C68", name: "Ruy López: Morphy Defense" },
  "e4 e5 Nf3 Nc6 Bb5 Nf6": { eco: "C65", name: "Ruy López: Berlin Defense" },
  "e4 e5 Nf3 Nc6 Bc4": { eco: "C50", name: "Italian Game" },
  "e4 e5 Nf3 Nc6 Bc4 Bc5": { eco: "C50", name: "Italian Game: Giuoco Piano" },
  "e4 e5 Nf3 Nc6 Bc4 Nf6": { eco: "C55", name: "Italian Game: Two Knights Defense" },
  "e4 e5 Nf3 Nf6": { eco: "C42", name: "Petrov's Defense" },
  "e4 e5 Nf3 d6": { eco: "C41", name: "Philidor Defense" },
  "e4 e5 Nf3 Nc6 d4": { eco: "C44", name: "Scotch Game" },
  "e4 e5 Nc3": { eco: "C25", name: "Vienna Game" },
  "e4 e5 f4": { eco: "C30", name: "King's Gambit" },
  "e4 e5 Bc4": { eco: "C23", name: "Bishop's Opening" },
  "e4 c5": { eco: "B20", name: "Sicilian Defense" },
  "e4 c5 Nf3": { eco: "B27", name: "Sicilian Defense" },
  "e4 c5 Nf3 d6": { eco: "B50", name: "Sicilian Defense" },
  "e4 c5 Nf3 Nc6": { eco: "B30", name: "Sicilian Defense: Old Sicilian" },
  "e4 c5 Nf3 e6": { eco: "B40", name: "Sicilian Defense: French Variation" },
  "e4 c5 Nf3 Nc6 Bb5": { eco: "B31", name: "Sicilian Defense: Rossolimo" },
  "e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6": { eco: "B90", name: "Sicilian Defense: Najdorf" },
  "e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 g6": { eco: "B70", name: "Sicilian Defense: Dragon" },
  "e4 c5 Nc3": { eco: "B23", name: "Sicilian Defense: Closed" },
  "e4 c5 c3": { eco: "B22", name: "Sicilian Defense: Alapin" },
  "e4 c6": { eco: "B10", name: "Caro-Kann Defense" },
  "e4 e6": { eco: "C00", name: "French Defense" },
  "e4 e6 d4 d5": { eco: "C01", name: "French Defense" },
  "e4 d5": { eco: "B01", name: "Scandinavian Defense" },
  "e4 d6": { eco: "B07", name: "Pirc Defense" },
  "e4 Nf6": { eco: "B02", name: "Alekhine's Defense" },
  "e4 g6": { eco: "B06", name: "Modern Defense" },
  // --- 1. d4 ---
  d4: { eco: "A40", name: "Queen's Pawn Opening" },
  "d4 d5": { eco: "D00", name: "Queen's Pawn Game" },
  "d4 d5 c4": { eco: "D06", name: "Queen's Gambit" },
  "d4 d5 c4 dxc4": { eco: "D20", name: "Queen's Gambit Accepted" },
  "d4 d5 c4 e6": { eco: "D30", name: "Queen's Gambit Declined" },
  "d4 d5 c4 c6": { eco: "D10", name: "Slav Defense" },
  "d4 Nf6": { eco: "A45", name: "Indian Defense" },
  "d4 Nf6 c4 e6": { eco: "E00", name: "Indian Game: East Indian" },
  "d4 Nf6 c4 e6 Nc3 Bb4": { eco: "E20", name: "Nimzo-Indian Defense" },
  "d4 Nf6 c4 e6 Nf3 b6": { eco: "E12", name: "Queen's Indian Defense" },
  "d4 Nf6 c4 g6 Nc3 Bg7 e4": { eco: "E60", name: "King's Indian Defense" },
  "d4 Nf6 c4 g6 Nc3 d5": { eco: "D80", name: "Grünfeld Defense" },
  "d4 Nf6 c4 c5": { eco: "A50", name: "Benoni Defense" },
  "d4 Nf6 Bg5": { eco: "A45", name: "Trompowsky Attack" },
  "d4 f5": { eco: "A80", name: "Dutch Defense" },
  // --- other first moves ---
  c4: { eco: "A10", name: "English Opening" },
  Nf3: { eco: "A04", name: "Réti Opening" },
  b3: { eco: "A01", name: "Nimzo-Larsen Attack" },
  f4: { eco: "A02", name: "Bird's Opening" },
  g3: { eco: "A00", name: "Hungarian Opening" },
  b4: { eco: "A00", name: "Sokolsky Opening" },
  g4: { eco: "A00", name: "Grob's Attack" },
};

// The deepest line in the table, so the matcher knows how far back to look.
const MAX_PLIES = Object.keys(OPENINGS).reduce(
  (max, key) => Math.max(max, key.split(" ").length),
  0
);

// SAN carries check/mate/annotation marks that never appear in an opening key,
// so they are stripped before comparison ("Nf6+" matches the line "Nf6").
function normalizeSan(san: string): string {
  return san.replace(/[+#!?]/g, "");
}

// The longest named opening whose defining line is a prefix of these moves, or
// null before any move is played and for lines no entry covers.
export function identifyOpening(sanMoves: string[]): Opening | null {
  const normalized = sanMoves.slice(0, MAX_PLIES).map(normalizeSan);
  for (let len = Math.min(normalized.length, MAX_PLIES); len >= 1; len--) {
    const opening = OPENINGS[normalized.slice(0, len).join(" ")];
    if (opening) return opening;
  }
  return null;
}
