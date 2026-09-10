import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isRecentSettlement,
  latestSettlement,
  noteSettlement,
  payoutWei,
  resetSettlements,
  settlementFromFrame,
  settlementFromWinner,
  subscribeSettlements,
} from "@/features/casino/lib/last-standing/settlements";

// Game 425 from GET /game/winners on 2026-09-10: one wallet opened the game
// and outlasted everyone, and the service's paid figure is the winner's half
// plus the starter's tenth in one transfer.
const ME = "0x6Fe0c92D880678F86a7d213695757ed58B09877F";
const money = (amount: string) => ({ amount, tokenSymbol: "ETH", usdValue: 0, formattedUsd: "" });
const ROW_425 = {
  gameId: 425,
  winner: ME,
  starter: ME,
  pot: money("0.000201231206442684"),
  toWinner: money("0.000100615603221342"),
  toStarter: money("0.000020123120644268"),
  toTreasury: money("0.000080492482577074"),
  paidToWinner: money("0.00012073872386561"),
  settlementTx: "0x5774d5c805e206bf70a3d4a09b69f17bf5261ce50564a8cc44349f8abb6cbbcc",
  settledAt: "2026-09-10T16:15:23.689Z",
};

afterEach(() => {
  resetSettlements();
  vi.useRealTimers();
});

describe("payoutWei", () => {
  it("is the service's paid figure for the winner, not the shares added again", () => {
    const s = settlementFromWinner(ROW_425);
    expect(payoutWei(s, ME)).toBe(120738723865610n);
    expect(payoutWei(s, ME.toLowerCase())).toBe(120738723865610n);
    expect(payoutWei(s, "0x000000000000000000000000000000000000dead")).toBe(0n);
    expect(payoutWei(s, null)).toBe(0n);
  });

  it("adds the shares itself when there is no paid figure", () => {
    const other = "0x000000000000000000000000000000000000beef";
    const s = settlementFromWinner({ ...ROW_425, paidToWinner: undefined, starter: other });
    expect(payoutWei(s, ME)).toBe(100615603221342n);
    expect(payoutWei(s, other)).toBe(20123120644268n);
  });

  it("reads a socket frame's wei strings, and refuses one without a hash", () => {
    const s = settlementFromFrame({
      gameId: 425,
      winner: ME,
      starter: ME,
      toWinnerWei: "100615603221342",
      toStarterWei: "20123120644268",
      transactionHash: ROW_425.settlementTx,
    });
    expect(s && payoutWei(s, ME)).toBe(120738723865610n);
    expect(settlementFromFrame({ gameId: 1, winner: ME, starter: ME })).toBeNull();
    expect(
      settlementFromFrame({
        gameId: 1,
        winner: ME,
        starter: ME,
        toWinnerWei: "x",
        transactionHash: "0x1",
      })
    ).toBeNull();
  });
});

describe("isRecentSettlement", () => {
  it("is true within two minutes of settling and false after", () => {
    const s = settlementFromWinner(ROW_425);
    const at = Date.parse(ROW_425.settledAt);
    expect(isRecentSettlement(s, at + 90_000)).toBe(true);
    expect(isRecentSettlement(s, at + 121_000)).toBe(false);
  });
});

describe("the settlement store", () => {
  it("notifies once per settlement and ignores a repeat", () => {
    const seen = vi.fn();
    const stop = subscribeSettlements(seen);
    const s = settlementFromWinner(ROW_425);
    noteSettlement(s);
    noteSettlement({ ...s });
    noteSettlement(null);
    expect(seen).toHaveBeenCalledTimes(1);
    expect(latestSettlement()?.gameId).toBe(425);
    stop();
  });
});
