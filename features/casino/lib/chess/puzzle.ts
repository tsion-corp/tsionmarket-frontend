import type { ChessPuzzle } from "@/features/casino/lib/api/types";

export type PuzzleFeedback = "init" | "good" | "fail" | "complete";

export const PUZZLE_DIFFICULTIES = [
  { label: "Easiest", rating: 800, delta: "-400" },
  { label: "Easier", rating: 1000, delta: "-200" },
  { label: "Normal", rating: 1200, delta: "" },
  { label: "Harder", rating: 1600, delta: "+400" },
  { label: "Hardest", rating: 2000, delta: "+800" },
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
  return `/chess/puzzle-themes/${asset}.svg`;
}
