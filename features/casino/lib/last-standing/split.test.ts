import { describe, expect, it } from "vitest";
import {
  estimateWinnerPayout,
  isSameAddress,
  winnerPayoutWei,
} from "@/features/casino/lib/last-standing/split";

const A = "0x6Fe0c92D880678F86a7d213695757ed58B09877F";
const B = "0x83ba9add556308aa5695658cecd9aa09aa91dfb5";

describe("winner payout", () => {
  it("pays the winner their share when someone else started the game", () => {
    expect(winnerPayoutWei(50n, 10n, A, B)).toBe(50n);
  });

  it("pays the winner both shares when they also started it", () => {
    // Game 8 on Base: starter and king were the same wallet, and GameSettled
    // paid toWinner and toStarter to it. Showing only toWinner short-changed
    // the display by the starter's 10%.
    expect(winnerPayoutWei(50n, 10n, A, A.toLowerCase())).toBe(60n);
  });

  it("estimates the same shares before settlement", () => {
    expect(estimateWinnerPayout(1, false)).toBeCloseTo(0.5, 9);
    expect(estimateWinnerPayout(1, true)).toBeCloseTo(0.6, 9);
    expect(estimateWinnerPayout(0.76, true)).toBeCloseTo(0.456, 9);
    // Owner-tuned bps flow through.
    expect(estimateWinnerPayout(1, true, { winner: 7000, starter: 500 })).toBeCloseTo(0.75, 9);
  });

  it("compares addresses without caring about case", () => {
    expect(isSameAddress(A, A.toLowerCase())).toBe(true);
    expect(isSameAddress(A, B)).toBe(false);
    expect(isSameAddress(A, null)).toBe(false);
  });
});
