import type { Square } from "@/features/casino/lib/chess/engine";
import type { PuzzlePathReward } from "@/features/casino/lib/chess/puzzle-path-reference";

export interface PuzzleCoachReference {
  id: string;
  title: string;
  fen: string;
  solutionUci: string;
  coachLine: string;
  prompt: string;
  wrongMoveFeedback: string;
  successFeedback: string;
  hints: readonly [string, string, string];
  hintFrom: Square;
  hintTo: Square;
  reward: PuzzlePathReward;
}

export const PUZZLE_COACH_REFERENCES: readonly PuzzleCoachReference[] = [
  {
    id: "2752337",
    title: "The trapped king",
    fen: "6rk/3K2pp/8/4N3/8/8/8/8 w - - 1 2",
    solutionUci: "e5f7",
    coachLine: "My king is trapped! If you can check my king in one move, you'll win!",
    prompt: "Find the checkmate in one move.",
    wrongMoveFeedback: "That move lets the king breathe. Look for a forcing knight check.",
    successFeedback: "Checkmate. The knight covers h8 while the rook blocks every escape square.",
    hints: [
      "Start with forcing moves: checks, captures, and threats.",
      "The knight on e5 can reach a square beside the trapped king.",
      "Select the knight on e5. Its mating square is highlighted.",
    ],
    hintFrom: { r: 3, c: 4 },
    hintTo: { r: 1, c: 5 },
    reward: { difficulty: "Hard", base: 40, speed: 10, streak: 2, daily: 0, retry: 8 },
  },
  {
    id: "2752339",
    title: "The back-rank net",
    fen: "4k3/R7/7R/8/8/3q1p2/8/4K3 w - - 1 2",
    solutionUci: "h6h8",
    coachLine:
      "Your rook on the left is cutting off my king's escape. If your other rook can control the whole back rank, it will be checkmate!",
    prompt: "Finish the ladder mate in one move.",
    wrongMoveFeedback: "That move misses the mate. Use the rook on h6 to seal the back rank.",
    successFeedback:
      "Checkmate. The h-file rook seals the back rank while the rook on a7 blocks every escape.",
    hints: [
      "The king has no safe square to its left. Look for a checking rook move.",
      "The rook on a7 is the barrier; the rook on h6 must finish the net.",
      "Select the rook on h6. Its mating square is highlighted.",
    ],
    hintFrom: { r: 2, c: 7 },
    hintTo: { r: 0, c: 7 },
    reward: {
      difficulty: "Extra hard",
      base: 50,
      speed: 15,
      streak: 3,
      daily: 30,
      retry: 10,
    },
  },
];
