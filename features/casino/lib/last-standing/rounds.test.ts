import { describe, expect, it } from "vitest";
import type { VaultActivity } from "@/features/casino/lib/vault-api";
import {
  currentRoundCount,
  currentRunActivities,
} from "@/features/casino/lib/last-standing/rounds";

// A round is a counter inside ONE game, not the game's number. Starting the
// game is round 1, and every stake after that adds one. The screen used to
// print the game id here, so game 253 read "Rounds #253" on its very first
// round.

function row(action: VaultActivity["action"], createdAt: string, address = "0xabc"): VaultActivity {
  return {
    id: `${action}-${createdAt}`,
    gameId: 253,
    action,
    address,
    amountWei: "380000",
    transactionHash: `0x${createdAt}`,
    createdAt,
  };
}

describe("currentRoundCount", () => {
  it("counts the opening stake as round 1", () => {
    expect(currentRoundCount([row("started", "2026-09-25T18:57:58.732Z")])).toBe(1);
  });

  it("adds a round for each player who stakes after the start", () => {
    const feed = [
      row("started", "2026-09-25T18:57:00.000Z", "0xa"),
      row("joined", "2026-09-25T18:58:00.000Z", "0xb"),
      row("joined", "2026-09-25T18:59:00.000Z", "0xc"),
    ];
    expect(currentRoundCount(feed)).toBe(3);
  });

  it("does not care what order the feed arrives in", () => {
    const feed = [
      row("joined", "2026-09-25T18:59:00.000Z", "0xc"),
      row("started", "2026-09-25T18:57:00.000Z", "0xa"),
      row("joined", "2026-09-25T18:58:00.000Z", "0xb"),
    ];
    expect(currentRoundCount(feed)).toBe(3);
  });

  it("keeps counting the same player who stakes again", () => {
    const feed = [
      row("started", "2026-09-25T18:57:00.000Z", "0xa"),
      row("joined", "2026-09-25T18:58:00.000Z", "0xb"),
      row("joined", "2026-09-25T18:59:00.000Z", "0xb"),
    ];
    expect(currentRoundCount(feed)).toBe(3);
  });

  it("does not count the win as a round", () => {
    const feed = [
      row("started", "2026-09-25T18:57:00.000Z", "0xa"),
      row("joined", "2026-09-25T18:58:00.000Z", "0xb"),
      row("won", "2026-09-25T18:59:03.990Z", "0xb"),
    ];
    expect(currentRoundCount(feed)).toBe(2);
  });

  // The vault reuses a game id when the contract is redeployed: game 253's own
  // feed carries a started/won pair from 30 August and another from 25
  // September. Counting every row would say round 2 on a game that has only
  // just opened, so the run being played is the one that began at the LAST
  // start, and everything before it belongs to a game that is already over.
  it("ignores an earlier game that reused this id", () => {
    const feed = [
      row("started", "2026-08-30T02:20:00.000Z", "0xold"),
      row("joined", "2026-08-30T02:21:00.000Z", "0xold2"),
      row("won", "2026-08-30T02:23:32.431Z", "0xold2"),
      row("started", "2026-09-25T18:57:58.732Z", "0xa"),
    ];
    expect(currentRoundCount(feed)).toBe(1);
  });

  it("counts only the stakes that followed the latest start", () => {
    const feed = [
      row("started", "2026-08-30T02:20:00.000Z", "0xold"),
      row("joined", "2026-08-30T02:21:00.000Z", "0xold2"),
      row("started", "2026-09-25T18:57:58.732Z", "0xa"),
      row("joined", "2026-09-25T18:58:30.000Z", "0xb"),
    ];
    expect(currentRoundCount(feed)).toBe(2);
  });

  // Never guessed. A number here is read as fact, and "Rounds #1" on a game
  // that is actually on its ninth is worse than no number at all.
  it("says it does not know rather than guessing, before the feed arrives", () => {
    expect(currentRoundCount([])).toBeNull();
  });

  it("says it does not know when the opening stake is missing from the feed", () => {
    expect(currentRoundCount([row("joined", "2026-09-25T18:58:00.000Z")])).toBeNull();
  });
});

describe("currentRunActivities", () => {
  it("hands back the run oldest first, opening stake included", () => {
    const feed = [
      row("joined", "2026-09-25T18:59:00.000Z", "0xc"),
      row("started", "2026-09-25T18:57:00.000Z", "0xa"),
      row("joined", "2026-09-25T18:58:00.000Z", "0xb"),
    ];
    expect(currentRunActivities(feed)?.map((r) => [r.action, r.address])).toEqual([
      ["started", "0xa"],
      ["joined", "0xb"],
      ["joined", "0xc"],
    ]);
  });

  // The table of plays must not show a finished game's rows next to this one's.
  it("drops the rows of an earlier game that reused this id", () => {
    const feed = [
      row("started", "2026-08-30T02:20:00.000Z", "0xold"),
      row("joined", "2026-08-30T02:21:00.000Z", "0xold2"),
      row("won", "2026-08-30T02:23:32.431Z", "0xold2"),
      row("started", "2026-09-25T18:57:58.732Z", "0xa"),
      row("joined", "2026-09-25T18:58:30.000Z", "0xb"),
    ];
    expect(currentRunActivities(feed)?.map((r) => r.address)).toEqual(["0xa", "0xb"]);
  });

  it("says it does not know rather than guessing, before the feed arrives", () => {
    expect(currentRunActivities([])).toBeNull();
  });
});
