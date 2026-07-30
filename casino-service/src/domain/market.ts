import { BadRequest, amount, type TokenAmount } from "./money.js";
import type { Match } from "./chess.js";

// Spectator market for a live match.
//
// Prices come from the position and from what spectators have already backed,
// never from a random walk. Two inputs:
//
//   1. Material balance, squashed through a logistic curve into a win
//      probability. This is what makes the odds move when someone blunders.
//   2. The money already on each side, which nudges the price so the book
//      does not take unlimited one-way risk.
//
// The margin is the house edge, applied to the fair price.

const MARGIN = 0.06;
const MIN_ODDS = 1.01;
const MAX_ODDS = 25;
// How strongly the existing book pulls the price. Kept gentle so a small
// market does not swing wildly on one bet.
const BOOK_WEIGHT = 0.25;

export type Selection = "white" | "draw" | "black";

export interface Bet {
  id: string;
  matchId: string;
  userId: string;
  selection: Selection;
  lockedOdds: number;
  stakeWei: bigint;
  state: "pending" | "won" | "lost" | "void";
  placedAt: string;
}

export interface OddsPoint {
  at: string;
  white: number;
}

function clampOdds(o: number): number {
  return Math.min(MAX_ODDS, Math.max(MIN_ODDS, Number(o.toFixed(2))));
}

export class Market {
  readonly matchId: string;
  readonly bets: Bet[] = [];
  readonly history: OddsPoint[] = [];
  private seq = 0;

  constructor(matchId: string) {
    this.matchId = matchId;
  }

  private stakedOn(selection: Selection): bigint {
    return this.bets
      .filter((b) => b.selection === selection && b.state === "pending")
      .reduce((sum, b) => sum + b.stakeWei, 0n);
  }

  // Fair win probabilities for white/draw/black, summing to 1.
  probabilities(match: Match): { white: number; draw: number; black: number } {
    // Material advantage into a win probability. The divisor sets how much a
    // pawn is worth in probability terms; 4 gives roughly the feel of real
    // engine evaluations at club level.
    const evalScore = match.materialBalance();
    const raw = 1 / (1 + Math.exp(-evalScore / 4));

    // Draws get likelier as material comes off and the position stays level.
    const drawBase = 0.18 * Math.exp(-Math.abs(evalScore) / 3);

    let white = raw * (1 - drawBase);
    let black = (1 - raw) * (1 - drawBase);
    const draw = drawBase;

    // Nudge toward the side carrying less money, so the book self-balances.
    const wStake = Number(this.stakedOn("white"));
    const bStake = Number(this.stakedOn("black"));
    const total = wStake + bStake;
    if (total > 0) {
      const share = wStake / total;
      const pull = (share - 0.5) * BOOK_WEIGHT;
      white = Math.min(0.97, Math.max(0.01, white + pull));
      black = Math.min(0.97, Math.max(0.01, black - pull));
    }

    const sum = white + draw + black;
    return { white: white / sum, draw: draw / sum, black: black / sum };
  }

  odds(match: Match) {
    const p = this.probabilities(match);
    // Fair price is 1/p; the margin shortens it into the house's favour.
    const price = (prob: number) => clampOdds((1 / prob) * (1 - MARGIN));
    return {
      white: price(p.white),
      draw: price(p.draw),
      black: price(p.black),
      whiteWinProbability: Math.round(p.white * 100),
      updatedAt: new Date().toISOString(),
    };
  }

  recordHistory(match: Match): void {
    const { white } = this.odds(match);
    const last = this.history[this.history.length - 1];
    if (last && last.white === white) return;
    this.history.push({ at: new Date().toISOString(), white });
    if (this.history.length > 60) this.history.shift();
  }

  priceFor(match: Match, selection: Selection): number {
    const o = this.odds(match);
    return selection === "white" ? o.white : selection === "draw" ? o.draw : o.black;
  }

  // Places a bet at the current price. The caller's expected price must be
  // within tolerance, otherwise the bet is rejected rather than filled at a
  // materially worse number.
  place(
    match: Match,
    userId: string,
    selection: Selection,
    stakeWei: bigint,
    expectedOdds: number
  ): Bet {
    if (match.state !== "in_progress") {
      throw new BadRequest("MATCH_NOT_ACTIVE", "This match is not accepting bets.");
    }
    if (match.colorOf(userId)) {
      throw new BadRequest("PLAYER_CANNOT_BET", "Players can't bet on their own game.", 403);
    }
    const current = this.priceFor(match, selection);
    // Two percent either way. Beyond that the user is agreeing to a price they
    // never saw.
    if (Math.abs(current - expectedOdds) / expectedOdds > 0.02) {
      throw new BadRequest("ODDS_MOVED", `The price moved to ${current.toFixed(2)}.`, 409);
    }
    const bet: Bet = {
      id: `b${++this.seq}`,
      matchId: this.matchId,
      userId,
      selection,
      lockedOdds: current,
      stakeWei,
      state: "pending",
      placedAt: new Date().toISOString(),
    };
    this.bets.push(bet);
    return bet;
  }

  // Marks every pending bet won or lost against the finished match. Returns
  // the payouts owed, keyed by user.
  settle(match: Match): Map<string, bigint> {
    const payouts = new Map<string, bigint>();
    if (!match.result) return payouts;
    const outcome: Selection =
      match.result.kind === "draw" ? "draw" : match.result.winner === "w" ? "white" : "black";

    for (const bet of this.bets) {
      if (bet.state !== "pending") continue;
      if (bet.selection === outcome) {
        bet.state = "won";
        // Odds are two decimals, so scale to integers before multiplying.
        const payout = (bet.stakeWei * BigInt(Math.round(bet.lockedOdds * 100))) / 100n;
        payouts.set(bet.userId, (payouts.get(bet.userId) ?? 0n) + payout);
      } else {
        bet.state = "lost";
      }
    }
    return payouts;
  }

  voidAll(): Bet[] {
    const voided = this.bets.filter((b) => b.state === "pending");
    for (const b of voided) b.state = "void";
    return voided;
  }

  betJson(bet: Bet, unitPriceUsd: number): Record<string, unknown> {
    const potential = (bet.stakeWei * BigInt(Math.round(bet.lockedOdds * 100))) / 100n;
    return {
      id: bet.id,
      matchId: bet.matchId,
      selection: bet.selection,
      lockedOdds: bet.lockedOdds,
      stake: amount(bet.stakeWei, unitPriceUsd) satisfies TokenAmount,
      potentialPayout: amount(potential, unitPriceUsd),
      state: bet.state,
      placedAt: bet.placedAt,
    };
  }
}
