import type { Board, PieceType, Square } from "@/features/casino/lib/chess/engine";

export type ChessLearnLessonId = "rook" | "bishop" | "queen" | "king" | "knight" | "pawn";

export interface ChessLearnLesson {
  id: ChessLearnLessonId;
  title: string;
  description: string;
  piece: PieceType;
  start: Square;
  targets: readonly Square[];
}

function square(name: string): Square {
  return {
    r: 8 - Number(name[1]),
    c: "abcdefgh".indexOf(name[0] ?? ""),
  };
}

export const CHESS_LEARN_LESSONS: readonly ChessLearnLesson[] = [
  {
    id: "rook",
    title: "The rook",
    description: "Move in straight lines across ranks and files.",
    piece: "r",
    start: square("d4"),
    targets: ["d7", "g7", "g3", "b3"].map(square),
  },
  {
    id: "bishop",
    title: "The bishop",
    description: "Stay on the diagonals and travel any distance.",
    piece: "b",
    start: square("d4"),
    targets: ["f6", "h4", "e1", "b4"].map(square),
  },
  {
    id: "queen",
    title: "The queen",
    description: "Combine the straight lines of a rook with a bishop's diagonals.",
    piece: "q",
    start: square("d4"),
    targets: ["d7", "g7", "g4", "b4", "b2"].map(square),
  },
  {
    id: "king",
    title: "The king",
    description: "Move one square at a time in any direction.",
    piece: "k",
    start: square("d4"),
    targets: ["e5", "e4", "d3", "c4", "c5", "d5"].map(square),
  },
  {
    id: "knight",
    title: "The knight",
    description: "Jump in an L shape, two squares then one.",
    piece: "n",
    start: square("e4"),
    targets: ["c5", "d7", "f8", "h7", "f6", "d5"].map(square),
  },
  {
    id: "pawn",
    title: "The pawn",
    description: "Advance toward promotion, with a two-square option on the first move.",
    piece: "p",
    start: square("e2"),
    targets: ["e4", "e5", "e6", "e7", "e8"].map(square),
  },
];

export function createChessLessonBoard(lesson: ChessLearnLesson): Board {
  const board: Board = Array.from({ length: 8 }, () => Array(8).fill(null));
  if (lesson.piece !== "k") board[7][0] = { type: "k", color: "w" };
  board[0][7] = { type: "k", color: "b" };
  board[lesson.start.r][lesson.start.c] = { type: lesson.piece, color: "w" };
  return board;
}

export function isChessLearnLessonId(value: unknown): value is ChessLearnLessonId {
  return CHESS_LEARN_LESSONS.some((lesson) => lesson.id === value);
}
