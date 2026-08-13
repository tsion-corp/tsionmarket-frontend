import { beforeEach, describe, expect, it, vi } from "vitest";

const chessClient = vi.hoisted(() => ({ chessGet: vi.fn() }));

vi.mock("@/features/casino/lib/api/chess-client", () => chessClient);

import {
  fetchChessPlayerRatings,
  fetchChessRatingHistory,
} from "@/features/casino/lib/api/chess-ratings";

beforeEach(() => vi.clearAllMocks());

describe("chess ratings api", () => {
  it("reads the rating card and a bounded performance history", async () => {
    chessClient.chessGet.mockResolvedValue({ player: "player/name", items: [] });

    await fetchChessPlayerRatings("player/name");
    await fetchChessRatingHistory("player/name", "blitz", 25);

    expect(chessClient.chessGet).toHaveBeenNthCalledWith(1, "/players/player%2Fname/ratings");
    expect(chessClient.chessGet).toHaveBeenNthCalledWith(
      2,
      "/players/player%2Fname/ratings/blitz/history",
      { limit: 25 }
    );
  });
});
