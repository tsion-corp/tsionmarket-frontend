import { describe, expect, it } from "vitest";
import type { ChessPuzzle, ChessPuzzleSolution } from "@/features/casino/lib/api/types";
import { toLichessPuzzleData } from "@/features/casino/components/chess-app/puzzle/puzzle-bridge";

const puzzle: ChessPuzzle = {
  id: "00sHx",
  sourceFen: "source-fen",
  fen: "puzzle-fen",
  lastMove: "e8d7",
  lastMoveSan: "Kd7",
  initialPly: 33,
  sideToMove: "white",
  rating: 1760,
  ratingDeviation: 80,
  popularity: 83,
  playCount: 72,
  themes: ["mateIn2"],
  openingTags: ["Italian_Game"],
  sourceUrl: "https://lichess.org/yyznGmXs/black#34",
  sourceGame: {
    id: "yyznGmXs",
    perf: { key: "blitz", name: "Blitz" },
    rated: true,
    players: [
      { name: "ZensAlviani", rating: 1582, title: null, flair: null, color: "white" },
      { name: "desso2b", rating: 1611, title: null, flair: null, color: "black" },
    ],
    pgn: "e4 e5 Nf3 Nc6 Bc4 Bc5 c3 d6 O-O Bg4 a4 a6 b4 Ba7 b5 axb5 axb5 Nce7 d3 Bxf2+ Kxf2 Rxa1 Kg1 Rxb1 Ba2 Ra1 Qb3 Qa8 Ba3 Rxf1+ Kxf1 Bxf3 Qxf7+ Kd7",
    clock: "3+0",
  },
  playerMoveCount: 2,
  narration: {
    introduction: { text: "Find the best move.", speech: null },
    hint: { text: "Find the mate.", speech: null },
    success: { text: "Solved.", speech: null },
  },
};

const solution: ChessPuzzleSolution = {
  puzzleId: puzzle.id,
  moves: [
    { uci: "a2e6", san: "Be6+", fen: "one" },
    { uci: "d7d8", san: "Kd8", fen: "two" },
    { uci: "f7f8", san: "Qf8#", fen: "three" },
  ],
};

describe("Lichess puzzle bridge", () => {
  it("passes the authoritative source game through unchanged", () => {
    const data = toLichessPuzzleData(puzzle, solution, 1500);

    expect(data.game).toEqual(puzzle.sourceGame);
    expect(data.game.players.map((player) => player.name)).toEqual(["ZensAlviani", "desso2b"]);
    expect(data.game.pgn.split(" ")).toHaveLength(34);
    expect(data.game).not.toHaveProperty("sourceFen");
    expect(data.game).not.toHaveProperty("setupMove");
  });
});
