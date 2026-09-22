import { describe, expect, it } from "vitest";
import { buildLeaderboard } from "@/features/casino/lib/last-standing/leaderboard";
import type { LeaderboardWinner, TokenAmount } from "@/features/casino/lib/vault-api";

const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const NATIVE = "0x0000000000000000000000000000000000000000";

function usdc(amount: string): TokenAmount {
  const raw = BigInt(Math.round(Number(amount) * 1e6)).toString();
  return {
    amount,
    raw,
    tokenSymbol: "USDC",
    token: USDC,
    decimals: 6,
    usdValue: 0,
    formattedUsd: "—",
  };
}

function eth(amount: string): TokenAmount {
  const raw = BigInt(Math.round(Number(amount) * 1e18)).toString();
  return {
    amount,
    raw,
    tokenSymbol: "ETH",
    token: NATIVE,
    decimals: 18,
    usdValue: 0,
    formattedUsd: "—",
  };
}

function win(winner: string, paid: TokenAmount, gameId = 1): LeaderboardWinner {
  return { gameId, winner, paid, settledAt: null };
}

const ETH_PRICE = 2_000;

describe("buildLeaderboard", () => {
  it("ranks wallets by everything they have won, biggest first", () => {
    const rows = buildLeaderboard(
      [win("0xAAA", usdc("1.00")), win("0xBBB", usdc("5.00")), win("0xAAA", usdc("3.00"))],
      ETH_PRICE
    );
    expect(rows.map((r) => r.address)).toEqual(["0xBBB", "0xAAA"]);
    expect(rows[0].totalUsd).toBeCloseTo(5, 6);
    expect(rows[1].totalUsd).toBeCloseTo(4, 6);
  });

  it("collapses a wallet's wins into one row and counts them", () => {
    const rows = buildLeaderboard(
      [win("0xAAA", usdc("1.00")), win("0xAAA", usdc("2.00")), win("0xAAA", usdc("0.50"))],
      ETH_PRICE
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].wins).toBe(3);
    expect(rows[0].bestUsd).toBeCloseTo(2, 6);
  });

  it("treats a wallet's address as the same player whatever its casing", () => {
    const rows = buildLeaderboard(
      [win("0xAbCdEf", usdc("1.00")), win("0xabcdef", usdc("2.00"))],
      ETH_PRICE
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].wins).toBe(2);
    expect(rows[0].totalUsd).toBeCloseTo(3, 6);
  });

  // A game carries its own asset, so a wallet's history can span tokens. Adding
  // 6-decimal units to 18-decimal ones would be off by twelve orders of
  // magnitude, which is the failure the per-token sum exists to stop.
  it("prices each asset by its own rule rather than adding raw units together", () => {
    const rows = buildLeaderboard(
      [win("0xAAA", usdc("10.00")), win("0xAAA", eth("0.01"))],
      ETH_PRICE
    );
    expect(rows).toHaveLength(1);
    // 10 USDC + (0.01 ETH x $2000) = $30.
    expect(rows[0].totalUsd).toBeCloseTo(30, 6);
  });

  // Summing the base units keeps the arithmetic exact; summing the priced
  // floats one win at a time is where a long history drifts.
  it("sums many small wins without drifting", () => {
    const rows = buildLeaderboard(
      Array.from({ length: 30 }, () => win("0xAAA", usdc("0.10"))),
      ETH_PRICE
    );
    expect(rows[0].totalUsd).toBeCloseTo(3, 9);
    expect(rows[0].wins).toBe(30);
  });

  // The route resolves paidToWinner (winner's share plus the starter's when one
  // wallet did both) before it serves the row, so the board ranks what settle
  // actually sent.
  it("ranks the amount the row carries", () => {
    expect(buildLeaderboard([win("0xAAA", usdc("1.50"))], ETH_PRICE)[0].totalUsd).toBeCloseTo(
      1.5,
      6
    );
  });

  // No price for an asset must not delete the player from the board.
  it("still counts a win it cannot price", () => {
    const odd = { amount: "5", raw: "5", tokenSymbol: "???", token: "0xdead", decimals: 0 };
    const rows = buildLeaderboard([win("0xAAA", odd as TokenAmount)], 0);
    expect(rows).toHaveLength(1);
    expect(rows[0].wins).toBe(1);
    expect(rows[0].totalUsd).toBe(0);
  });

  it("is empty when nobody has won", () => {
    expect(buildLeaderboard([], ETH_PRICE)).toEqual([]);
  });
});
