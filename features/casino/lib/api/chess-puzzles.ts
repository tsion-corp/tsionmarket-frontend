"use client";

import { chessGet, chessPost } from "@/features/casino/lib/api/chess-client";
import type {
  ChessPuzzle,
  ChessPuzzleAttempt,
  ChessPuzzleCatalog,
} from "@/features/casino/lib/api/types";

export async function fetchPuzzleCatalog(): Promise<ChessPuzzleCatalog> {
  return chessGet<ChessPuzzleCatalog>("/puzzles/catalog");
}

export async function fetchNextPuzzle(
  player: string,
  rating: number,
  theme?: string
): Promise<ChessPuzzle> {
  return chessGet<ChessPuzzle>("/puzzles/next", {
    player,
    rating,
    ...(theme ? { theme } : {}),
  });
}

export async function attemptPuzzle(
  puzzleId: string,
  input: {
    player: string;
    uci: string;
    solutionPly: number;
    idempotencyKey: string;
    durationMs: number;
    hintUsed: boolean;
  }
): Promise<ChessPuzzleAttempt> {
  return chessPost<ChessPuzzleAttempt>(`/puzzles/${encodeURIComponent(puzzleId)}/attempt`, {
    player: input.player,
    uci: input.uci,
    solutionPly: input.solutionPly,
    idempotencyKey: input.idempotencyKey,
    durationMs: input.durationMs,
    hintUsed: input.hintUsed,
  });
}
