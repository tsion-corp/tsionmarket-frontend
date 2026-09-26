import { describe, expect, it } from "vitest";
import { onlyVaultGames, publicGames } from "@/features/casino/lib/vault-game";

// Game 261 as the service actually serves it (checked 2026-09-26). Started
// private on one device and listed on another, because the old filter only
// read this browser's localStorage.
const REAL_261 = {
  gameId: 261,
  starter: "0x8517",
  king: "0x8517",
  pot: { amount: "0.38", tokenSymbol: "USDC", usdValue: 0.38, formattedUsd: "$0.38" },
  minWager: { amount: "0.38", tokenSymbol: "USDC", usdValue: 0.38, formattedUsd: "$0.38" },
  endTime: 1,
  timeRemaining: 36,
  settled: false,
  active: true,
  isPrivate: true,
};

describe("the cross-device leak", () => {
  it("hides a private game from a device that never marked it", () => {
    const rows = onlyVaultGames([REAL_261]);
    // No local marks at all: this is the phone.
    expect(publicGames(rows, [])).toEqual([]);
  });
});
