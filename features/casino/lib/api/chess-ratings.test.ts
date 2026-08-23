import { beforeEach, describe, expect, it, vi } from "vitest";

const chessClient = vi.hoisted(() => ({ chessGet: vi.fn() }));

vi.mock("@/features/casino/lib/api/chess-client", () => chessClient);

import {
  fetchChessLeaderboard,
  fetchChessLeaderboardCountries,
  fetchChessLeaderboardRules,
  fetchChessPlayerRatings,
  fetchChessPlayerRatingChart,
  fetchChessPlayerRatingStats,
  fetchChessRatingPoolStats,
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

  it("reads filtered leaderboard data and the public rating rules", async () => {
    chessClient.chessGet.mockResolvedValue({ items: [] });

    await fetchChessLeaderboard({ perf: "blitz", country: "NG", page: 2, limit: 20 });
    await fetchChessLeaderboardCountries("blitz");
    await fetchChessRatingPoolStats("blitz", "NG");
    await fetchChessLeaderboardRules();

    expect(chessClient.chessGet).toHaveBeenNthCalledWith(1, "/leaderboard", {
      perf: "blitz",
      country: "NG",
      page: 2,
      limit: 20,
    });
    expect(chessClient.chessGet).toHaveBeenNthCalledWith(2, "/leaderboard/countries", {
      perf: "blitz",
    });
    expect(chessClient.chessGet).toHaveBeenNthCalledWith(3, "/leaderboard/stats", {
      perf: "blitz",
      country: "NG",
    });
    expect(chessClient.chessGet).toHaveBeenNthCalledWith(4, "/leaderboard/rules");
  });

  it("reads a player's selected rating summary and chart", async () => {
    chessClient.chessGet.mockResolvedValue({ points: [] });

    await fetchChessPlayerRatingStats("player/name", "rapid");
    await fetchChessPlayerRatingChart("player/name", "rapid", "90d");

    expect(chessClient.chessGet).toHaveBeenNthCalledWith(
      1,
      "/players/player%2Fname/ratings/rapid/stats"
    );
    expect(chessClient.chessGet).toHaveBeenNthCalledWith(
      2,
      "/players/player%2Fname/ratings/rapid/chart",
      { range: "90d" }
    );
  });
});
