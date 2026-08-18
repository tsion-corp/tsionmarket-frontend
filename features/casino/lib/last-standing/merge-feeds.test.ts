import { describe, expect, it } from "vitest";
import { mergeActivities, mergeWinners } from "@/features/casino/lib/last-standing/merge-feeds";
import type { ChainActivity, ChainSettledGame } from "@/features/casino/hooks/use-vault-actions";
import type { VaultActivity, VaultWinner } from "@/features/casino/lib/vault-api";

const ETH = 4000;

function settled(gameId: number, potWei = 200_000_000_000_000n): ChainSettledGame {
  return {
    gameId,
    winner: "0xKING",
    starter: "0xSTARTER",
    potWei,
    toWinnerWei: potWei / 2n,
    endTime: 1_786_800_000 + gameId,
    settlementTx: null,
    settledAt: null,
  };
}

function indexedWinner(gameId: number): VaultWinner {
  const money = { amount: "0.0002", tokenSymbol: "ETH", usdValue: 0.8, formattedUsd: "$0.80" };
  return {
    gameId,
    winner: "0xKING",
    starter: "0xSTARTER",
    pot: money,
    toWinner: money,
    settlementTx: `0xtx${gameId}`,
    settledAt: "2026-08-15T17:00:00.000Z",
  };
}

describe("mergeWinners", () => {
  it("builds the Hall of Winners from the chain when the index has nothing", () => {
    // The state the app shipped in: six settled games on-chain, an empty
    // indexed feed, and a table that said "No rounds settled yet".
    const rows = mergeWinners([], [settled(1), settled(2), settled(3)], ETH);
    expect(rows.map((r) => r.gameId)).toEqual([3, 2, 1]);
    expect(rows[0].winner).toBe("0xKING");
  });

  it("shows what the winner was paid, not the whole pot", () => {
    const [row] = mergeWinners([], [settled(1, 1_000_000_000_000_000n)], ETH);
    // 0.001 ETH pot at $4000 is $4; the winner's half is $2.
    expect(row.pot.usdValue).toBeCloseTo(4, 6);
    expect(row.toWinner.usdValue).toBeCloseTo(2, 6);
  });

  it("prefers the indexed row where both know a game", () => {
    // The indexed row has the settlement tx and exact time; the chain row
    // does not. When the indexer catches up its row must win.
    const rows = mergeWinners([indexedWinner(2)], [settled(1), settled(2)], ETH);
    expect(rows.find((r) => r.gameId === 2)?.settlementTx).toBe("0xtx2");
    expect(rows.find((r) => r.gameId === 1)?.settlementTx).toBe("game-1");
  });

  it("takes the payout from the chain even where the index has a row", () => {
    // The index reports the winner's share alone; the chain row carries what
    // settle() sent, the starter's share included when the winner opened the
    // game. 0.0002 ETH pot at $4000: 60% is $0.48, not the index's $0.80 guess.
    const chainRow = { ...settled(2), toWinnerWei: (200_000_000_000_000n * 6n) / 10n };
    const [row] = mergeWinners([indexedWinner(2)], [chainRow], ETH);
    expect(row.settlementTx).toBe("0xtx2");
    expect(row.toWinner.usdValue).toBeCloseTo(0.48, 6);
  });

  it("keeps indexed rows the chain tail no longer reaches", () => {
    // The chain scan is a bounded tail; history older than that is the
    // indexer's to remember.
    const rows = mergeWinners([indexedWinner(1)], [settled(40)], ETH);
    expect(rows.map((r) => r.gameId)).toEqual([40, 1]);
  });

  it("never lists a game twice", () => {
    const rows = mergeWinners([indexedWinner(2)], [settled(2)], ETH);
    expect(rows.filter((r) => r.gameId === 2)).toHaveLength(1);
  });

  it("links the settle transaction and dates the row by it when the log is in reach", () => {
    // Games 1 to 6 were settled 29 hours after they ended; the row should say
    // when the money moved, and link to the transaction that moved it.
    const [row] = mergeWinners(
      [],
      [{ ...settled(1), settlementTx: "0xsettle1", settledAt: 1_786_920_953 }],
      ETH
    );
    expect(row.settlementTx).toBe("0xsettle1");
    expect(row.settledAt).toBe(new Date(1_786_920_953 * 1000).toISOString());
  });

  it("gives every row a distinct key", () => {
    // The table keys rows by settlementTx; two rows sharing one collide.
    const rows = mergeWinners([], [settled(1), settled(2)], ETH);
    expect(new Set(rows.map((r) => r.settlementTx)).size).toBe(rows.length);
  });
});

function start(gameId: number, timestamp: number): ChainActivity {
  return {
    gameId,
    action: "started",
    address: "0xSTARTER",
    amountWei: 200_000_000_000_000n,
    transactionHash: `0xstart${gameId}`,
    timestamp,
  };
}

function join(gameId: number, timestamp: number): ChainActivity {
  return {
    gameId,
    action: "joined",
    address: "0xJOINER",
    amountWei: 300_000_000_000_000n,
    transactionHash: `0xjoin${gameId}-${timestamp}`,
    timestamp,
  };
}

function win(gameId: number, timestamp: number): ChainActivity {
  return {
    gameId,
    action: "won",
    address: "0xKING",
    amountWei: 100_000_000_000_000n,
    transactionHash: `0xsettle${gameId}`,
    timestamp,
  };
}

function indexedActivity(tx: string, createdAt: string): VaultActivity {
  return {
    id: `idx-${tx}`,
    action: "joined",
    address: "0xJOINER",
    amountWei: "1",
    transactionHash: tx,
    createdAt,
  };
}

describe("mergeActivities", () => {
  it("shows the chain's starts when the index has nothing", () => {
    // "No plays yet" on a game that had just been started and played.
    const rows = mergeActivities([], [start(6, 1_786_815_155)]);
    expect(rows).toHaveLength(1);
    expect(rows[0].action).toBe("started");
    expect(rows[0].createdAt).toBe(new Date(1_786_815_155 * 1000).toISOString());
  });

  it("does not repeat a start the index already carries", () => {
    const rows = mergeActivities(
      [indexedActivity("0xstart6", "2026-08-15T17:32:35.000Z")],
      [start(6, 1_786_815_155)]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("idx-0xstart6");
  });

  it("matches transactions without caring about hex case", () => {
    const rows = mergeActivities(
      [indexedActivity("0xSTART6", "2026-08-15T17:32:35.000Z")],
      [start(6, 1_786_815_155)]
    );
    expect(rows).toHaveLength(1);
  });

  it("carries joins and wins from the chain, not only starts", () => {
    // WagerPlaced and GameSettled are in the compiled ABI; a feed built from
    // starts alone said "no plays" on a game three people had joined.
    const rows = mergeActivities([], [start(6, 100), join(6, 110), join(6, 120), win(6, 200)]);
    expect(rows.map((r) => r.action)).toEqual(["won", "joined", "joined", "started"]);
    expect(rows[0].amountWei).toBe("100000000000000");
    expect(rows[1].address).toBe("0xJOINER");
  });

  it("keys every chain row distinctly, even two joins on one game", () => {
    const rows = mergeActivities([], [join(6, 110), join(6, 120)]);
    expect(new Set(rows.map((r) => r.id)).size).toBe(2);
  });

  it("orders everything newest first, whichever source it came from", () => {
    const rows = mergeActivities(
      [indexedActivity("0xjoin", "2026-08-15T17:40:00.000Z")],
      [start(6, 1_786_815_155), start(7, 1_786_816_000)]
    );
    expect(rows.map((r) => r.transactionHash)).toEqual(["0xstart7", "0xjoin", "0xstart6"]);
  });
});
