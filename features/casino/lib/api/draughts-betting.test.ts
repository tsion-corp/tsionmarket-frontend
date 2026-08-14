import { beforeEach, describe, expect, it, vi } from "vitest";

const client = vi.hoisted(() => ({
  draughtsGet: vi.fn(),
  draughtsPost: vi.fn(),
}));

vi.mock("@/features/casino/lib/api/draughts-client", () => client);

import {
  fetchDraughtsMarketOdds,
  fetchMyDraughtsBets,
  placeDraughtsBet,
} from "@/features/casino/lib/api/draughts-betting";

beforeEach(() => vi.clearAllMocks());

describe("draughts betting api", () => {
  it("reads public odds and authenticated bettor history from draughts routes", async () => {
    client.draughtsGet
      .mockResolvedValueOnce({
        status: "open",
        totalPoolUsdc: "0",
        white: { poolUsdc: "0", decimalOdds: null },
        draw: { poolUsdc: "0", decimalOdds: null },
        black: { poolUsdc: "0", decimalOdds: null },
      })
      .mockResolvedValueOnce([]);

    await fetchDraughtsMarketOdds("match/id");
    await fetchMyDraughtsBets("match/id", "0xbettor");

    expect(client.draughtsGet).toHaveBeenNthCalledWith(1, "/betting/markets/match%2Fid/odds");
    expect(client.draughtsGet).toHaveBeenNthCalledWith(
      2,
      "/betting/markets/match%2Fid/bets",
      { bettor: "0xbettor" },
      { requireAuth: true }
    );
  });

  it("places an idempotent draughts bet", async () => {
    client.draughtsPost.mockResolvedValue({
      id: "bet-1",
      matchId: "match-1",
      outcome: "white",
      stakeUsdc: "2",
      status: "active",
      payoutUsdc: "0",
    });

    await placeDraughtsBet({
      matchId: "match-1",
      bettor: "0xbettor",
      selection: "white",
      stakeUsdc: "2",
    });

    expect(client.draughtsPost).toHaveBeenCalledWith("/betting/bets", {
      matchId: "match-1",
      bettor: "0xbettor",
      outcome: "white",
      stakeUsdc: "2",
      idempotencyKey: expect.any(String),
    });
  });
});
