import type { ChessPuzzle } from "@/features/casino/lib/api/types";

export type PuzzleFeedback = "init" | "good" | "fail" | "complete";

export const PUZZLE_DIFFICULTIES = [
  { label: "Easiest", delta: -600 },
  { label: "Easier", delta: -300 },
  { label: "Normal", delta: 0 },
  { label: "Harder", delta: 300 },
  { label: "Hardest", delta: 600 },
] as const;

export const PUZZLE_THEMES = [
  { value: "", label: "Healthy mix" },
  { value: "fork", label: "Fork" },
  { value: "pin", label: "Pin" },
  { value: "skewer", label: "Skewer" },
  { value: "discoveredAttack", label: "Discovered attack" },
  { value: "hangingPiece", label: "Hanging piece" },
  { value: "sacrifice", label: "Sacrifice" },
  { value: "mateIn1", label: "Mate in 1" },
  { value: "mateIn2", label: "Mate in 2" },
  { value: "endgame", label: "Endgame" },
] as const;

export function puzzleThemeLabel(theme: string): string {
  const known = PUZZLE_THEMES.find((item) => item.value === theme);
  if (known) return known.label;
  return theme.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (letter) => letter.toUpperCase());
}

export function primaryPuzzleTheme(puzzle: ChessPuzzle): string {
  return puzzle.themes.find((theme) => theme !== "short" && theme !== "long") ?? "mix";
}

export function puzzleThemeArtwork(puzzle: ChessPuzzle): string {
  const theme = primaryPuzzleTheme(puzzle);
  const asset = /^mateIn\d+$/u.test(theme) ? "mate" : /^[A-Za-z0-9]+$/u.test(theme) ? theme : "mix";
  return `/images/puzzle-themes/${asset}.svg`;
}

export function puzzleThemeDescription(theme: string): string {
  const descriptions: Record<string, string> = {
    fork: "A tactic where one piece attacks two enemy pieces at the same time.",
    pin: "A pinned piece cannot move without exposing a more valuable piece behind it.",
    skewer: "Attack a valuable piece so that moving it exposes another target.",
    discoveredAttack: "Moving one piece reveals an attack from another piece.",
    hangingPiece: "A piece is undefended or insufficiently defended and can be won.",
    sacrifice: "Give up material to gain a decisive tactical advantage.",
    mateIn1: "Deliver checkmate in one move.",
    mateIn2: "Force checkmate in two moves.",
    endgame: "Find the precise move in a position with few pieces remaining.",
  };
  return descriptions[theme] ?? "Find the best move in a position taken from a real game.";
}
