import { beforeEach, describe, expect, it, vi } from "vitest";

const chessClient = vi.hoisted(() => ({
  chessGet: vi.fn(),
  chessPost: vi.fn(),
}));

vi.mock("@/features/casino/lib/api/chess-client", () => chessClient);

import {
  fetchSwissBets,
  fetchSwissMarketOdds,
  placeSwissBet,
} from "@/features/casino/lib/api/swiss-betting";

beforeEach(() => vi.clearAllMocks());

describe("Swiss betting api", () => {
  it("reads public odds and session-bound bettor history", async () => {
    chessClient.chessGet.mockResolvedValue({});

    await fetchSwissMarketOdds("swiss/id");
    await fetchSwissBets("swiss/id", "0xbettor");

    expect(chessClient.chessGet).toHaveBeenNthCalledWith(1, "/betting/swiss/swiss%2Fid/odds");
    expect(chessClient.chessGet).toHaveBeenNthCalledWith(
      2,
      "/betting/swiss/swiss%2Fid/bets",
      { bettor: "0xbettor" },
      { requireAuth: true }
    );
  });

  it("places a retry-safe bet on a tournament participant", async () => {
    chessClient.chessPost.mockResolvedValue({ id: "bet-1" });

    await placeSwissBet({
      swissId: "swiss-1",
      bettor: "0xbettor",
      predictedPlayerId: "player-1",
      stakeUsdc: "2",
      idempotencyKey: "swiss-bet-key-1",
    });

    expect(chessClient.chessPost).toHaveBeenCalledWith("/betting/swiss/swiss-1/bets", {
      bettor: "0xbettor",
      predictedPlayerId: "player-1",
      stakeUsdc: "2",
      idempotencyKey: "swiss-bet-key-1",
    });
  });
});
