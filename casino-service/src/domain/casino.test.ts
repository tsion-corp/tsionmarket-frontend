import { describe, it, expect, beforeEach } from "vitest";
import { Casino } from "./casino.js";
import { InMemoryLedger } from "./ledger.js";
import { potBreakdown } from "./money.js";

const STAKE = 10n ** 18n; // 1 unit
const FUND = 100n * 10n ** 18n;

let ledger: InMemoryLedger;
let casino: Casino;

async function fund(...users: string[]) {
  for (const u of users) await ledger.credit(u, FUND, "test");
}

// Plays the shortest possible checkmate: white delivers Qh5xf7#.
async function foolsMate(matchId: string, white: string, black: string) {
  await casino.move(matchId, white, "e2e4");
  await casino.move(matchId, black, "e7e5");
  await casino.move(matchId, white, "d1h5");
  await casino.move(matchId, black, "b8c6");
  await casino.move(matchId, white, "f1c4");
  await casino.move(matchId, black, "g8f6");
  await casino.move(matchId, white, "h5f7");
}

beforeEach(async () => {
  ledger = new InMemoryLedger();
  casino = new Casino(ledger);
  await fund("alice", "bob", "carol");
});

describe("staked chess between two players", () => {
  it("escrows both stakes when a challenge is accepted", async () => {
    const { challenge } = await casino.createChallenge("alice", STAKE, "5+3", "invite");
    expect(await ledger.balanceOf("alice")).toBe(FUND - STAKE);

    const match = await casino.acceptChallenge(challenge.id, "bob");
    expect(await ledger.balanceOf("bob")).toBe(FUND - STAKE);
    expect(match.state).toBe("in_progress");
    expect(match.white?.id).toBe("alice");
    expect(match.black?.id).toBe("bob");
  });

  it("pays the winner the pot less the fee, and never invents money", async () => {
    const before = ledger.totalValue();
    const { challenge } = await casino.createChallenge("alice", STAKE, "5+3", "invite");
    const match = await casino.acceptChallenge(challenge.id, "bob");

    await foolsMate(match.id, "alice", "bob");

    expect(match.state).toBe("settled");
    expect(match.result).toEqual({ kind: "checkmate", winner: "w" });

    const { payout, fee } = potBreakdown(STAKE);
    expect(await ledger.balanceOf("alice")).toBe(FUND - STAKE + payout);
    expect(await ledger.balanceOf("bob")).toBe(FUND - STAKE);
    expect(await ledger.balanceOf("house")).toBe(fee);
    // Value is conserved: the fee moved, nothing was created.
    expect(ledger.totalValue()).toBe(before);
  });

  it("rejects a move from the player whose turn it isn't", async () => {
    const { challenge } = await casino.createChallenge("alice", STAKE, "5+3", "invite");
    const match = await casino.acceptChallenge(challenge.id, "bob");
    await expect(casino.move(match.id, "bob", "e7e5")).rejects.toThrow(/not your move/i);
  });

  it("rejects an illegal move and leaves the position untouched", async () => {
    const { challenge } = await casino.createChallenge("alice", STAKE, "5+3", "invite");
    const match = await casino.acceptChallenge(challenge.id, "bob");
    const before = match.fen;
    await expect(casino.move(match.id, "alice", "e2e5")).rejects.toThrow(/legal/i);
    expect(match.fen).toBe(before);
  });

  it("rejects a move from someone who isn't in the game", async () => {
    const { challenge } = await casino.createChallenge("alice", STAKE, "5+3", "invite");
    const match = await casino.acceptChallenge(challenge.id, "bob");
    await expect(casino.move(match.id, "carol", "e2e4")).rejects.toThrow(/not playing/i);
  });

  it("pays the opponent when a player resigns", async () => {
    const { challenge } = await casino.createChallenge("alice", STAKE, "5+3", "invite");
    const match = await casino.acceptChallenge(challenge.id, "bob");
    await casino.resign(match.id, "alice");

    const { payout } = potBreakdown(STAKE);
    expect(match.result).toEqual({ kind: "resignation", winner: "b" });
    expect(await ledger.balanceOf("bob")).toBe(FUND - STAKE + payout);
  });

  it("won't let a player stake more than they hold", async () => {
    await expect(casino.createChallenge("alice", FUND + 1n, "5+3", "invite")).rejects.toThrow(
      /not enough balance/i
    );
  });

  it("returns the stake when a challenge is cancelled", async () => {
    const { challenge } = await casino.createChallenge("alice", STAKE, "5+3", "invite");
    await casino.cancelChallenge(challenge.id, "alice");
    expect(await ledger.balanceOf("alice")).toBe(FUND);
  });

  it("only lets one opponent take a challenge", async () => {
    const { challenge } = await casino.createChallenge("alice", STAKE, "5+3", "invite");
    await casino.acceptChallenge(challenge.id, "bob");
    await expect(casino.acceptChallenge(challenge.id, "carol")).rejects.toThrow();
    expect(await ledger.balanceOf("carol")).toBe(FUND);
  });
});

describe("invite links", () => {
  it("resolves an invite code to its challenge, once", async () => {
    const { challenge } = await casino.createChallenge("alice", STAKE, "10+0", "invite");
    expect(challenge.inviteCode).toBeTruthy();

    const found = casino.challengeByInvite(challenge.inviteCode!);
    expect(found.id).toBe(challenge.id);

    await casino.acceptChallenge(challenge.id, "bob");
    // Once taken, the link is dead rather than joinable twice.
    expect(() => casino.challengeByInvite(challenge.inviteCode!)).toThrow(/no longer valid/i);
  });
});

describe("automatch", () => {
  it("pairs two players waiting at the same stake", async () => {
    const first = await casino.createChallenge("alice", STAKE, "5+3", "auto");
    expect(first.ticket?.state).toBe("searching");

    const second = await casino.createChallenge("bob", STAKE, "5+3", "auto");
    expect(second.ticket?.state).toBe("matched");

    const matchId = second.ticket!.matchId!;
    const match = casino.match(matchId);
    expect(match.state).toBe("in_progress");
    expect([match.white?.id, match.black?.id].sort()).toEqual(["alice", "bob"]);

    // Both stakes are escrowed exactly once each.
    expect(await ledger.balanceOf("alice")).toBe(FUND - STAKE);
    expect(await ledger.balanceOf("bob")).toBe(FUND - STAKE);
  });

  it("does not pair players at different stakes", async () => {
    await casino.createChallenge("alice", STAKE, "5+3", "auto");
    const second = await casino.createChallenge("bob", STAKE * 2n, "5+3", "auto");
    expect(second.ticket?.state).toBe("searching");
  });

  it("refunds a cancelled search", async () => {
    const { ticket } = await casino.createChallenge("alice", STAKE, "5+3", "auto");
    await casino.cancelTicket(ticket!.id, "alice");
    expect(await ledger.balanceOf("alice")).toBe(FUND);
  });
});

describe("spectator betting", () => {
  async function liveMatch() {
    const { challenge } = await casino.createChallenge("alice", STAKE, "5+3", "invite");
    return casino.acceptChallenge(challenge.id, "bob");
  }

  it("prices from the position, not at random", async () => {
    const match = await liveMatch();
    const mk = casino.market(match.id);
    const opening = mk.odds(match);
    // A level start prices both sides close together.
    expect(Math.abs(opening.white - opening.black)).toBeLessThan(0.5);

    // White wins a queen; white must shorten.
    await casino.move(match.id, "alice", "e2e4");
    await casino.move(match.id, "bob", "d7d5");
    await casino.move(match.id, "alice", "e4d5");
    const after = mk.odds(match);
    expect(after.white).toBeLessThan(opening.white);
    expect(after.whiteWinProbability).toBeGreaterThan(opening.whiteWinProbability);
  });

  it("takes a spectator's stake and pays it out on a win", async () => {
    const match = await liveMatch();
    const mk = casino.market(match.id);
    const odds = mk.odds(match).white;

    const bet = await casino.placeBet(match.id, "carol", "white", STAKE, odds);
    expect(await ledger.balanceOf("carol")).toBe(FUND - STAKE);

    await foolsMate(match.id, "alice", "bob");

    expect(bet.state).toBe("won");
    const expected = (STAKE * BigInt(Math.round(bet.lockedOdds * 100))) / 100n;
    expect(await ledger.balanceOf("carol")).toBe(FUND - STAKE + expected);
  });

  it("keeps a losing spectator stake", async () => {
    const match = await liveMatch();
    const odds = casino.market(match.id).odds(match).black;
    await casino.placeBet(match.id, "carol", "black", STAKE, odds);

    await foolsMate(match.id, "alice", "bob");
    expect(await ledger.balanceOf("carol")).toBe(FUND - STAKE);
  });

  it("rejects a bet when the price has moved away from what was shown", async () => {
    const match = await liveMatch();
    await expect(casino.placeBet(match.id, "carol", "white", STAKE, 99)).rejects.toThrow(
      /price moved/i
    );
    // The rejected stake is returned, not swallowed.
    expect(await ledger.balanceOf("carol")).toBe(FUND);
  });

  it("won't let a player bet on their own game", async () => {
    const match = await liveMatch();
    const odds = casino.market(match.id).odds(match).white;
    await expect(casino.placeBet(match.id, "alice", "white", STAKE, odds)).rejects.toThrow(
      /own game/i
    );
    expect(await ledger.balanceOf("alice")).toBe(FUND - STAKE);
  });

  it("conserves value across a match with spectator bets", async () => {
    const before = ledger.totalValue();
    const match = await liveMatch();
    const mk = casino.market(match.id);
    await casino.placeBet(match.id, "carol", "white", STAKE, mk.odds(match).white);
    await foolsMate(match.id, "alice", "bob");
    expect(ledger.totalValue()).toBe(before);
  });
});

describe("a drawn game", () => {
  async function liveMatch(stake = STAKE) {
    const { challenge } = await casino.createChallenge("alice", stake, "5+3", "invite");
    return casino.acceptChallenge(challenge.id, "bob");
  }

  // Both players agree a draw: one offers, the other accepts.
  async function agreeDraw(matchId: string) {
    await casino.offerDraw(matchId, "alice");
    await casino.offerDraw(matchId, "bob");
  }

  it("returns both stakes and takes no fee", async () => {
    const match = await liveMatch();
    await agreeDraw(match.id);

    expect(match.result).toEqual({ kind: "draw", reason: "agreement" });
    // Stakes come back, then go straight into the rematch, so each player is
    // down exactly one stake again rather than two.
    expect(await ledger.balanceOf("alice")).toBe(FUND - STAKE);
    expect(await ledger.balanceOf("bob")).toBe(FUND - STAKE);
    expect(await ledger.balanceOf("house")).toBe(0n);
  });

  it("starts a rematch immediately, with colours swapped", async () => {
    const match = await liveMatch();
    await agreeDraw(match.id);

    expect(match.rematchId).toBeTruthy();
    const rematch = casino.match(match.rematchId!);
    expect(rematch.state).toBe("in_progress");
    expect(rematch.rematchOf).toBe(match.id);
    // Whoever had black opens the rematch.
    expect(rematch.white?.id).toBe("bob");
    expect(rematch.black?.id).toBe("alice");
    expect(rematch.stakeWei).toBe(match.stakeWei);
    expect(rematch.timeControl).toBe(match.timeControl);
  });

  it("escrows both stakes again for the rematch", async () => {
    const before = ledger.totalValue();
    const match = await liveMatch();
    await agreeDraw(match.id);
    const rematch = casino.match(match.rematchId!);

    // The rematch is a real staked game: playing it out pays a real pot.
    await casino.resign(rematch.id, "alice");
    const { payout } = potBreakdown(STAKE);
    expect(await ledger.balanceOf("bob")).toBe(FUND - STAKE + payout);
    expect(ledger.totalValue()).toBe(before);
  });

  it("pays a spectator who called the draw", async () => {
    const match = await liveMatch();
    const mk = casino.market(match.id);
    const drawOdds = mk.odds(match).draw;
    const bet = await casino.placeBet(match.id, "carol", "draw", STAKE, drawOdds);
    expect(await ledger.balanceOf("carol")).toBe(FUND - STAKE);

    await agreeDraw(match.id);

    expect(bet.state).toBe("won");
    const expected = (STAKE * BigInt(Math.round(bet.lockedOdds * 100))) / 100n;
    expect(await ledger.balanceOf("carol")).toBe(FUND - STAKE + expected);
  });

  it("lets a spectator stake their draw winnings on the rematch", async () => {
    const match = await liveMatch();
    const drawOdds = casino.market(match.id).odds(match).draw;
    await casino.placeBet(match.id, "carol", "draw", STAKE, drawOdds);
    await agreeDraw(match.id);

    const winnings = (await ledger.balanceOf("carol")) - (FUND - STAKE);
    expect(winnings).toBeGreaterThan(0n);

    // The payout is ordinary balance, so it backs a bet on the rematch like
    // any other money.
    const rematch = casino.match(match.rematchId!);
    const rematchMarket = casino.market(rematch.id);
    const bet = await casino.placeBet(
      rematch.id,
      "carol",
      "white",
      winnings,
      rematchMarket.odds(rematch).white
    );
    expect(bet.stakeWei).toBe(winnings);
  });

  it("loses a spectator who bet on a side when the game is drawn", async () => {
    const match = await liveMatch();
    const odds = casino.market(match.id).odds(match).white;
    await casino.placeBet(match.id, "carol", "white", STAKE, odds);
    await agreeDraw(match.id);
    expect(await ledger.balanceOf("carol")).toBe(FUND - STAKE);
  });

  it("skips the rematch when a player can no longer cover the stake", async () => {
    // A draw refunds both stakes, so a player is normally able to re-stake by
    // definition. The guard exists for the case where their balance moved
    // underneath us, which in production means a withdrawal between the two
    // games. This ledger reports bob as short at that moment.
    const drained = new InMemoryLedger();
    const short = Object.create(drained) as InMemoryLedger;
    short.balanceOf = async (userId: string) => (userId === "bob" ? 0n : drained.balanceOf(userId));
    const c2 = new Casino(short);
    await drained.credit("alice", FUND, "test");
    await drained.credit("bob", FUND, "test");

    const { challenge } = await c2.createChallenge("alice", STAKE, "5+3", "invite");
    const match = await c2.acceptChallenge(challenge.id, "bob");
    await c2.offerDraw(match.id, "alice");
    await c2.offerDraw(match.id, "bob");

    expect(match.result?.kind).toBe("draw");
    // No rematch, and the returned stakes stay returned.
    expect(match.rematchId).toBeNull();
    expect(await drained.balanceOf("alice")).toBe(FUND);
  });

  it("only draws when both players agree", async () => {
    const match = await liveMatch();
    await casino.offerDraw(match.id, "alice");
    expect(match.state).toBe("in_progress");
    expect(match.drawOffered).toBe("w");

    // Replying with a move withdraws the offer instead of accepting it.
    await casino.move(match.id, "alice", "e2e4");
    expect(match.drawOffered).toBeNull();
  });

  it("conserves value across a draw, a rematch and spectator bets", async () => {
    const before = ledger.totalValue();
    const match = await liveMatch();
    const mk = casino.market(match.id);
    await casino.placeBet(match.id, "carol", "draw", STAKE, mk.odds(match).draw);
    await agreeDraw(match.id);
    const rematch = casino.match(match.rematchId!);
    await foolsMate(rematch.id, "bob", "alice");
    expect(ledger.totalValue()).toBe(before);
  });
});
