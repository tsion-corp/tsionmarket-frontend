import {
  attemptPuzzle,
  fetchNextPuzzle,
  fetchPuzzleSolution,
} from "@/features/casino/lib/api/chess-puzzles";
import type { ChessPuzzle, ChessPuzzleSolution } from "@/features/casino/lib/api/types";
import {
  puzzleThemeDescription,
  puzzleThemeLabel,
} from "@/features/casino/lib/chess/puzzle";

export interface LichessPuzzleModule {
  initModule(options: Record<string, unknown>): Promise<void>;
}

interface PuzzleBridgeOptions {
  color?: 'black' | 'random' | 'white';
  difficulty?: 'easiest' | 'easier' | 'normal' | 'harder' | 'hardest';
  player: string;
  playerRating: number;
  targetRating: number;
  theme?: string;
}

interface ArkPuzzleBridge {
  attempt(input: {
    puzzleId: string;
    uci: string;
    solutionPly: number;
    hintUsed: boolean;
  }): Promise<void>;
  complete(input: { win: boolean }): Promise<Record<string, unknown>>;
  vote(...args: unknown[]): Promise<void>;
  voteTheme(...args: unknown[]): Promise<void>;
  report(...args: unknown[]): Promise<void>;
}

declare global {
  interface Window {
    arkPuzzleBridge?: ArkPuzzleBridge;
  }
}

function sourceGameId(sourceUrl: string): string {
  try {
    return new URL(sourceUrl).pathname.split("/").filter(Boolean)[0] || "import";
  } catch {
    return "import";
  }
}

function angleFor(puzzle: ChessPuzzle, requestedTheme?: string) {
  const key = requestedTheme || "mix";
  return {
    key,
    name: key === "mix" ? "Puzzle Themes" : puzzleThemeLabel(key),
    desc:
      key === "mix"
        ? "A little bit of everything. You do not know what to expect, so you remain ready for anything."
        : puzzleThemeDescription(key),
  };
}

export function toLichessPuzzleData(
  puzzle: ChessPuzzle,
  solution: ChessPuzzleSolution,
  playerRating: number,
  requestedTheme?: string
) {
  return {
    puzzle: {
      id: puzzle.id,
      solution: solution.moves.map((move) => move.uci),
      rating: puzzle.rating,
      plays: puzzle.playCount,
      initialPly: puzzle.initialPly,
      themes: puzzle.themes,
    },
    angle: angleFor(puzzle, requestedTheme),
    game: puzzle.sourceGame ?? {
      id: sourceGameId(puzzle.sourceUrl),
      rated: false,
      players: [
        { name: "ghost", color: "white" },
        { name: "ghost", color: "black" },
      ],
      pgn: "",
      sourceFen: puzzle.sourceFen,
      setupMove: puzzle.lastMove,
    },
    user: { rating: playerRating, provisional: false },
  };
}

export function lichessPuzzleOptions(
  puzzle: ChessPuzzle,
  solution: ChessPuzzleSolution,
  options: PuzzleBridgeOptions
) {
  return {
    pref: {
      coords: 1,
      is3d: false,
      destination: true,
      rookCastle: true,
      moveEvent: 2,
      highlight: true,
      animation: { duration: 200 },
      blindfold: false,
      keyboardMove: false,
      voiceMove: false,
    },
    data: toLichessPuzzleData(puzzle, solution, options.playerRating, options.theme),
    settings: {
      color: options.color,
      difficulty: options.difficulty ?? "normal",
    },
    showRatings: true,
    externalEngineEndpoint: "",
  };
}

export function installPuzzleBridge(options: PuzzleBridgeOptions) {
  const pending = new Set<Promise<void>>();
  const startedAt = Date.now();

  const bridge = {
    async attempt(input: {
      puzzleId: string;
      uci: string;
      solutionPly: number;
      hintUsed: boolean;
    }) {
      const request = attemptPuzzle(input.puzzleId, {
        player: options.player,
        uci: input.uci,
        solutionPly: input.solutionPly,
        idempotencyKey: crypto.randomUUID(),
        durationMs: Math.max(0, Date.now() - startedAt),
        hintUsed: input.hintUsed,
      }).then(() => undefined);
      pending.add(request);
      try {
        await request;
      } finally {
        pending.delete(request);
      }
    },
    async complete(input: { win: boolean }) {
      await Promise.allSettled(pending);
      const nextPuzzle = await fetchNextPuzzle(
        options.player,
        options.targetRating,
        options.theme
      );
      const nextSolution = await fetchPuzzleSolution(nextPuzzle.id);
      return {
        round: { win: input.win, ratingDiff: 0, themes: {} },
        next: toLichessPuzzleData(
          nextPuzzle,
          nextSolution,
          options.playerRating,
          options.theme
        ),
      };
    },
    async vote() {},
    async voteTheme() {},
    async report() {},
  };

  window.arkPuzzleBridge = bridge;
  return () => {
    if (window.arkPuzzleBridge === bridge) delete window.arkPuzzleBridge;
  };
}
