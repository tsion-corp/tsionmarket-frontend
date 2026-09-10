import { describe, expect, it } from "vitest";
import {
  isVaultGame,
  onlyVaultActivities,
  onlyVaultGames,
  onlyVaultWinners,
  sortGameRows,
  toChainGame,
} from "@/features/casino/lib/vault-game";

// Captured from the production service and hub on 2026-09-10.
const API_ROW = {
  gameId: 421,
  starter: "0xb381bBC996fa0e326A4a81a881573fB501bD8AAE",
  king: "0xb381bBC996fa0e326A4a81a881573fB501bD8AAE",
  pot: { amount: "0.0002", tokenSymbol: "ETH", usdValue: 0.494922, formattedUsd: "$0.49" },
  minWager: { amount: "0.0002", tokenSymbol: "ETH", usdValue: 0.494922, formattedUsd: "$0.49" },
  endTime: 1788989581,
  timeRemaining: 0,
  settled: true,
  active: false,
};

const HUB_ROW = {
  minWagerWei: "200683125358721",
  endTime: 1788948057,
  king: "0x6Fe0c92D880678F86a7d213695757ed58B09877F",
  timeRemaining: 56,
  gameId: 416,
  active: true,
  starter: "0x6Fe0c92D880678F86a7d213695757ed58B09877F",
  potWei: "200683125358721",
  settled: false,
};

// The vault's own domain Game carries potWei and minWagerWei; the API view
// the lobby renders carries pot and minWager with USD figures. The socket
// feed publishes the domain shape, so a row can arrive without `pot`, and a
// card then died on `pot.usdValue`. Rows are checked before they are kept.
describe("isVaultGame", () => {
  it("accepts the API view", () => {
    expect(isVaultGame(API_ROW)).toBe(true);
  });

  it("rejects the vault's domain shape and anything else", () => {
    const domain = { gameId: 361, potWei: "200642859722551", minWagerWei: "1", endTime: 1 };
    expect(isVaultGame(domain)).toBe(false);
    expect(isVaultGame({ ...API_ROW, pot: { amount: "1" } })).toBe(false);
    expect(isVaultGame({ ...API_ROW, gameId: "361" })).toBe(false);
    expect(isVaultGame(null)).toBe(false);
    expect(isVaultGame("x")).toBe(false);
  });
});

describe("onlyVaultGames", () => {
  it("keeps the well-formed rows and drops the rest", () => {
    const rows = onlyVaultGames([API_ROW, { gameId: 2, potWei: "1" }, null]);
    expect(rows.map((r) => r.gameId)).toEqual([421]);
  });

  it("is empty for a non-array", () => {
    expect(onlyVaultGames({})).toEqual([]);
    expect(onlyVaultGames(undefined)).toEqual([]);
  });
});

// The service records a winner or starter as null when a log did not carry
// it. Rendered, that row crashed the page on `address.length`; here it is
// dropped at the boundary instead.
describe("onlyVaultWinners", () => {
  const money = { amount: "0.0001", tokenSymbol: "ETH", usdValue: 0.25, formattedUsd: "$0.25" };
  const winner = {
    gameId: 421,
    winner: "0xb381bBC996fa0e326A4a81a881573fB501bD8AAE",
    starter: "0xb381bBC996fa0e326A4a81a881573fB501bD8AAE",
    pot: money,
    toWinner: money,
    toStarter: money,
    toTreasury: money,
    paidToWinner: money,
    settlementTx: "0xdb58beca38042435057259b9729377076451940c9217dbb819efa78b6a02243e",
    settledAt: "2026-09-09T21:33:13.661Z",
  };

  it("keeps a well-formed row, with or without the newer split fields", () => {
    const older = {
      gameId: winner.gameId,
      winner: winner.winner,
      starter: winner.starter,
      pot: winner.pot,
      toWinner: winner.toWinner,
      settlementTx: winner.settlementTx,
      settledAt: winner.settledAt,
    };
    expect(onlyVaultWinners([winner, older])).toHaveLength(2);
  });

  it("drops a row with no winner, no amounts, or no settlement", () => {
    expect(
      onlyVaultWinners([
        { ...winner, winner: null },
        { ...winner, toWinner: undefined },
        { ...winner, settlementTx: null },
        null,
        "x",
      ])
    ).toEqual([]);
    expect(onlyVaultWinners("no")).toEqual([]);
  });
});

describe("onlyVaultActivities", () => {
  const row = {
    id: "f6e03855",
    action: "won",
    gameId: 421,
    address: "0xb381bBC996fa0e326A4a81a881573fB501bD8AAE",
    amountWei: "100000000000000",
    transactionHash: "0xdb58beca38042435057259b9729377076451940c9217dbb819efa78b6a02243e",
    createdAt: "2026-09-09T21:33:13.671Z",
  };

  it("keeps the three actions and drops the rest", () => {
    expect(
      onlyVaultActivities([
        row,
        { ...row, action: "started" },
        { ...row, action: "joined" },
        { ...row, action: "settled" },
        { ...row, gameId: null },
        { ...row, transactionHash: null },
        { ...row, address: null },
      ])
    ).toHaveLength(3);
  });
});

describe("sortGameRows", () => {
  it("keeps an API row as an API row and a hub row as a chain row", () => {
    const sorted = sortGameRows([API_ROW, HUB_ROW]);
    expect(sorted.api.map((g) => g.gameId)).toEqual([421]);
    expect(sorted.chain).toEqual([
      {
        gameId: 416,
        starter: HUB_ROW.starter,
        king: HUB_ROW.king,
        potWei: 200683125358721n,
        minWagerWei: 200683125358721n,
        endTime: 1788948057,
      },
    ]);
    expect(sorted.dropped).toBe(0);
  });

  it("counts a row in neither shape as dropped", () => {
    expect(sortGameRows([{ gameId: 3, potWei: "not-a-number" }]).dropped).toBe(1);
  });
});

describe("toChainGame", () => {
  it("refuses a wei string that is not an integer", () => {
    expect(toChainGame({ ...HUB_ROW, potWei: "1.5" })).toBeNull();
  });
});
