import { describe, expect, it } from "vitest";
import {
  activityAmount,
  isSelfStartedWin,
} from "@/features/casino/lib/last-standing/activity-payout";
import type { VaultActivity, VaultWinner } from "@/features/casino/lib/vault-api";

const ME = "0x6Fe0c92D880678F86a7d213695757ed58B09877F";
const SOMEONE = "0x1111111111111111111111111111111111111111";

const money = (amount: string) => ({
  amount,
  raw: String(Math.round(Number(amount) * 1e6)),
  tokenSymbol: "USDC",
  token: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  decimals: 6,
  usdValue: 0,
  formattedUsd: "—",
});

// Game 4 on 2026-09-15: one play of 0.38, opened and won by the same wallet.
const WON: VaultActivity = {
  id: "a1",
  gameId: 4,
  action: "won",
  address: ME,
  amountWei: "190000",
  transactionHash: "0x1",
  createdAt: new Date().toISOString(),
};
const PLAYED: VaultActivity = { ...WON, id: "a2", action: "started", amountWei: "380000" };

const settlement = (over: Partial<VaultWinner> = {}) =>
  ({
    gameId: 4,
    winner: ME,
    starter: ME,
    pot: money("0.38"),
    toWinner: money("0.19"),
    toStarter: money("0.038"),
    toTreasury: money("0.152"),
    paidToWinner: money("0.228"),
    settlementTx: "0xsettle",
    settledAt: new Date().toISOString(),
    ...over,
  }) as unknown as VaultWinner;

describe("what a win row shows", () => {
  // The service reports a win as the winner's share alone. When one wallet
  // opened and won the game it also received the starter's tenth in the same
  // settle(), so the feed said $0.19 beside a banner and a Hall of Winners
  // that both said $0.23 for the one payout.
  it("shows what the wallet received when the winner started the game", () => {
    expect(activityAmount(WON, [settlement()]).amount).toBe("0.228");
  });

  // A win by someone who did not open the game IS just the winner's share.
  // Nothing is added to it, and the service's own figure stands.
  it("leaves a win by another player exactly as the service reported it", () => {
    const amount = activityAmount(WON, [settlement({ starter: SOMEONE })]);
    expect(amount.amount).toBe("190000");
  });

  it("touches no row but a win", () => {
    expect(activityAmount(PLAYED, [settlement()]).amount).toBe("380000");
  });

  // The winners feed lags the activity feed, and a row with no settlement yet
  // must render rather than wait.
  it("falls back to the service's figure when no settlement is loaded", () => {
    expect(activityAmount(WON, []).amount).toBe("190000");
  });

  it("matches the settlement by game, never by position", () => {
    const other = settlement({ gameId: 9, paidToWinner: money("99") });
    expect(activityAmount(WON, [other]).amount).toBe("190000");
  });

  // An older row carries no paidToWinner; the winner's share is then the most
  // the service can tell us, and is what we would have shown anyway.
  it("uses toWinner when the row predates paidToWinner", () => {
    const old = settlement();
    delete (old as { paidToWinner?: unknown }).paidToWinner;
    expect(activityAmount(WON, [old]).amount).toBe("0.19");
  });

  it("names a self-started win", () => {
    expect(isSelfStartedWin(settlement())).toBe(true);
    expect(isSelfStartedWin(settlement({ starter: SOMEONE }))).toBe(false);
  });
});
