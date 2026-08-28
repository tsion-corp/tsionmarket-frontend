import { describe, expect, it } from "vitest";
import { computerWagerStatusLine } from "@/features/casino/lib/chess/computer-wager-copy";

const base = {
  over: true,
  cancelled: false,
  humanWon: false,
  stakeUsdc: "1000",
  potentialPayoutUsdc: "2000",
  creditedPayoutUsdc: null,
  status: "settled",
};

describe("computerWagerStatusLine", () => {
  it("shows the double payout while the game is active", () => {
    expect(computerWagerStatusLine({ ...base, over: false })).toBe(
      "Staked 1000 USDC · win pays 2000 USDC"
    );
  });

  it("keeps a win conditional while fair-play review is open", () => {
    expect(computerWagerStatusLine({ ...base, humanWon: true, status: "review" })).toBe(
      "Win under review · 2000 USDC will be owed if approved."
    );
  });

  it("explains an approved payout that may still need cashier funding", () => {
    expect(
      computerWagerStatusLine({
        ...base,
        humanWon: true,
        creditedPayoutUsdc: "2000",
      })
    ).toContain("remains pending there if the cashier needs funding");
  });

  it("does not describe a draw or loss as refunded", () => {
    expect(computerWagerStatusLine(base)).toBe("Stake forfeited to Stockfish.");
  });

  it("shows a real abort refund", () => {
    expect(computerWagerStatusLine({ ...base, cancelled: true })).toBe("Your stake was refunded.");
  });
});
