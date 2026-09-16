export const PUZZLE_DIFFICULTIES = ['easiest', 'easier', 'normal', 'harder', 'hardest'] as const;
export type PuzzleDifficulty = (typeof PUZZLE_DIFFICULTIES)[number];

export const PUZZLE_COLORS = ['black', 'random', 'white'] as const;
export type PuzzleColor = (typeof PUZZLE_COLORS)[number];

const RATING_OFFSETS: Record<PuzzleDifficulty, number> = {
  easiest: -600,
  easier: -300,
  normal: 0,
  harder: 300,
  hardest: 600,
};

export function parsePuzzleDifficulty(value: string | null): PuzzleDifficulty {
  return PUZZLE_DIFFICULTIES.includes(value as PuzzleDifficulty)
    ? (value as PuzzleDifficulty)
    : 'normal';
}

export function parsePuzzleColor(value: string | null): PuzzleColor {
  return PUZZLE_COLORS.includes(value as PuzzleColor) ? (value as PuzzleColor) : 'random';
}

export function puzzleTargetRating(playerRating: number, difficulty: PuzzleDifficulty): number {
  return Math.min(3500, Math.max(400, playerRating + RATING_OFFSETS[difficulty]));
}
