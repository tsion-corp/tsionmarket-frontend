import { describe, expect, it } from "vitest";
import { onlyLeaderboardWinners } from "@/features/casino/lib/vault-game";
import { buildLeaderboard } from "@/features/casino/lib/last-standing/leaderboard";

// The board came up empty against a route that was serving 581 rows: the
// server trims each winner to what the board reads, and the client was parsing
// them with the FULL winner guard, which requires pot, starter and
// settlementTx. Every row failed it and was dropped without a sound.
//
// This is the wiring, not the mechanism: one fixture in exactly the shape
// app/api/vault/leaderboard emits, carried through the parser the fetch uses
// and into the ranking.
const FROM_ROUTE = [
  {
    gameId: 146,
    winner: "0x4fb1F66B6eFF6c8f9430950b46219Ab646327B28",
    paid: {
      amount: "0.228",
      raw: "228000",
      tokenSymbol: "USDC",
      token: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      decimals: 6,
    },
    settledAt: "2026-09-22T16:32:25.761Z",
  },
  {
    gameId: 145,
    winner: "0x6f60C91fe496b97875B72012c4C851e7bd30DE1A",
    paid: {
      amount: "0.19",
      raw: "190000",
      tokenSymbol: "USDC",
      token: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      decimals: 6,
    },
    settledAt: null,
  },
];

describe("the leaderboard route's rows reach the board", () => {
  it("accepts what the route actually serves", () => {
    expect(onlyLeaderboardWinners(FROM_ROUTE)).toHaveLength(2);
  });

  it("ranks them once parsed", () => {
    const rows = buildLeaderboard(onlyLeaderboardWinners(FROM_ROUTE), 0);
    expect(rows).toHaveLength(2);
    expect(rows[0].totalUsd).toBeCloseTo(0.228, 6);
    expect(rows[1].totalUsd).toBeCloseTo(0.19, 6);
  });

  it("drops a row with no winner or no amount rather than ranking a blank", () => {
    const bad = [
      { gameId: 1, settledAt: null },
      { gameId: 2, winner: "0xAAA", settledAt: null },
      { gameId: 3, winner: "0xAAA", paid: { raw: "1" }, settledAt: null },
    ];
    expect(onlyLeaderboardWinners(bad)).toHaveLength(0);
  });

  it("is empty for anything that is not a list", () => {
    expect(onlyLeaderboardWinners(undefined)).toEqual([]);
    expect(onlyLeaderboardWinners({ winners: [] })).toEqual([]);
  });
});
