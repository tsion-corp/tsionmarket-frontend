import { beforeEach, describe, expect, it, vi } from "vitest";

const chessClient = vi.hoisted(() => ({ chessGet: vi.fn(), chessPost: vi.fn() }));

vi.mock("@/features/casino/lib/api/chess-client", () => chessClient);

import {
  attemptPuzzle,
  fetchNextPuzzle,
  fetchPuzzleCatalog,
} from "@/features/casino/lib/api/chess-puzzles";

beforeEach(() => vi.clearAllMocks());

describe("chess puzzle api", () => {
  it("requests a player-specific themed puzzle", async () => {
    chessClient.chessGet.mockResolvedValue({ id: "abc" });

    await fetchPuzzleCatalog();
    await fetchNextPuzzle("player/name", 1600, "fork");

    expect(chessClient.chessGet).toHaveBeenNthCalledWith(1, "/puzzles/catalog");
    expect(chessClient.chessGet).toHaveBeenNthCalledWith(2, "/puzzles/next", {
      player: "player/name",
      rating: 1600,
      theme: "fork",
    });
  });

  it("submits the server-owned solution ply and idempotency key", async () => {
    chessClient.chessPost.mockResolvedValue({ completed: false });

    await attemptPuzzle("puzzle/id", {
      player: "0xplayer",
      uci: "e2e4",
      solutionPly: 2,
      idempotencyKey: "attempt-1",
      durationMs: 920,
      hintUsed: true,
    });

    expect(chessClient.chessPost).toHaveBeenCalledWith("/puzzles/puzzle%2Fid/attempt", {
      player: "0xplayer",
      uci: "e2e4",
      solutionPly: 2,
      idempotencyKey: "attempt-1",
      durationMs: 920,
      hintUsed: true,
    });
  });
});
