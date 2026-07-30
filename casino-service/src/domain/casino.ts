import { randomBytes } from "node:crypto";
import { Match, type Player, type TimeControl } from "./chess.js";
import { Market, type Selection } from "./market.js";
import { HOUSE, InMemoryLedger, type Ledger } from "./ledger.js";
import { BadRequest, amount, potBreakdown } from "./money.js";

// The casino: challenges, matchmaking, live matches and their markets, with
// every stake escrowed on commitment and released on settlement.

export interface Challenge {
  id: string;
  creator: Player;
  timeControl: TimeControl;
  stakeWei: bigint;
  inviteCode: string | null;
  matchId: string;
  createdAt: string;
}

export interface Ticket {
  id: string;
  userId: string;
  stakeWei: bigint;
  timeControl: TimeControl;
  state: "searching" | "matched" | "expired";
  matchId: string | null;
  createdAt: string;
}

function id(prefix: string): string {
  return prefix + randomBytes(6).toString("hex");
}

export class Casino {
  readonly ledger: Ledger & { totalValue?: () => bigint };
  private matches = new Map<string, Match>();
  private markets = new Map<string, Market>();
  private challenges = new Map<string, Challenge>();
  private byInvite = new Map<string, string>();
  private tickets = new Map<string, Ticket>();
  private players = new Map<string, Player>();
  // Set by the host from a price feed; display only.
  unitPriceUsd = 0;

  constructor(ledger: Ledger & { totalValue?: () => bigint } = new InMemoryLedger()) {
    this.ledger = ledger;
  }

  registerPlayer(p: Player): void {
    this.players.set(p.id, p);
  }

  playerOf(userId: string): Player {
    const known = this.players.get(userId);
    if (known) return known;
    // A first-time caller gets a provisional identity so play is never blocked
    // on a separate profile call.
    const p: Player = {
      id: userId,
      username: `player_${userId.slice(0, 6)}`,
      rating: 1500,
      walletAddress: userId,
    };
    this.players.set(userId, p);
    return p;
  }

  match(matchId: string): Match {
    const m = this.matches.get(matchId);
    if (!m) throw new BadRequest("NOT_FOUND", "No such match.", 404);
    m.tick();
    // A match that just ran out of time settles here, so money moves even if
    // nobody was watching.
    void this.settleIfFinished(m);
    return m;
  }

  market(matchId: string): Market {
    let mk = this.markets.get(matchId);
    if (!mk) {
      mk = new Market(matchId);
      this.markets.set(matchId, mk);
    }
    return mk;
  }

  liveMatches(): Match[] {
    for (const m of this.matches.values()) {
      m.tick();
      void this.settleIfFinished(m);
    }
    return [...this.matches.values()].filter((m) => m.state === "in_progress");
  }

  openChallenges(): Challenge[] {
    return [...this.challenges.values()].filter((c) => {
      const m = this.matches.get(c.matchId);
      return m?.state === "awaiting_opponent";
    });
  }

  challengeByInvite(code: string): Challenge {
    const challengeId = this.byInvite.get(code);
    const c = challengeId ? this.challenges.get(challengeId) : undefined;
    if (!c) throw new BadRequest("NOT_FOUND", "That invite link is no longer valid.", 404);
    return c;
  }

  // Creates a challenge and escrows the creator's stake. In "auto" mode the
  // creator also joins the matchmaking queue, and is paired with the first
  // compatible opponent.
  async createChallenge(
    userId: string,
    stakeWei: bigint,
    timeControl: TimeControl,
    mode: "invite" | "auto"
  ): Promise<{ challenge: Challenge; ticket: Ticket | null }> {
    const creator = this.playerOf(userId);
    const match = new Match(id("m"), timeControl, stakeWei);
    // The creator plays white; the joiner takes black.
    match.white = creator;
    this.matches.set(match.id, match);

    await this.ledger.hold(userId, stakeWei, match.id);

    const challenge: Challenge = {
      id: id("c"),
      creator,
      timeControl,
      stakeWei,
      inviteCode: mode === "invite" ? randomBytes(4).toString("hex") : null,
      matchId: match.id,
      createdAt: new Date().toISOString(),
    };
    this.challenges.set(challenge.id, challenge);
    if (challenge.inviteCode) this.byInvite.set(challenge.inviteCode, challenge.id);

    if (mode === "auto") {
      const ticket = await this.enqueue(userId, stakeWei, timeControl, challenge);
      return { challenge, ticket };
    }
    return { challenge, ticket: null };
  }

  // Pairs an auto-mode creator with anyone already waiting at the same stake
  // and time control.
  private async enqueue(
    userId: string,
    stakeWei: bigint,
    timeControl: TimeControl,
    challenge: Challenge
  ): Promise<Ticket> {
    const waiting = [...this.tickets.values()].find(
      (t) =>
        t.state === "searching" &&
        t.userId !== userId &&
        t.stakeWei === stakeWei &&
        t.timeControl === timeControl
    );

    const ticket: Ticket = {
      id: id("t"),
      userId,
      stakeWei,
      timeControl,
      state: "searching",
      matchId: null,
      createdAt: new Date().toISOString(),
    };
    this.tickets.set(ticket.id, ticket);

    if (waiting) {
      // The earlier player's match becomes the venue; this player joins it and
      // their own empty challenge is dropped.
      const host = this.matches.get(waiting.matchId ?? "");
      const hostMatch = host ?? this.matches.get(this.challengeFor(waiting)?.matchId ?? "");
      if (hostMatch && hostMatch.state === "awaiting_opponent") {
        hostMatch.black = this.playerOf(userId);
        hostMatch.start();
        // This player's stake is already held against their own match id, so
        // move it onto the match they actually joined.
        await this.ledger.refund(challenge.matchId);
        await this.ledger.hold(userId, stakeWei, hostMatch.id);
        this.matches.delete(challenge.matchId);
        this.challenges.delete(challenge.id);

        waiting.state = "matched";
        waiting.matchId = hostMatch.id;
        ticket.state = "matched";
        ticket.matchId = hostMatch.id;
        return ticket;
      }
    }

    ticket.matchId = challenge.matchId;
    return ticket;
  }

  private challengeFor(ticket: Ticket): Challenge | undefined {
    return [...this.challenges.values()].find((c) => c.creator.id === ticket.userId);
  }

  ticket(ticketId: string): Ticket {
    const t = this.tickets.get(ticketId);
    if (!t) throw new BadRequest("NOT_FOUND", "No such search.", 404);
    // A ticket that is still searching but whose match has filled is matched.
    if (t.state === "searching" && t.matchId) {
      const m = this.matches.get(t.matchId);
      if (m?.state === "in_progress") t.state = "matched";
    }
    return t;
  }

  async cancelTicket(ticketId: string, userId: string): Promise<void> {
    const t = this.ticket(ticketId);
    if (t.userId !== userId) throw new BadRequest("NOT_YOURS", "That isn't your search.", 403);
    if (t.state === "matched") {
      throw new BadRequest("ALREADY_MATCHED", "You've already been paired.");
    }
    t.state = "expired";
    if (t.matchId) {
      await this.ledger.refund(t.matchId);
      this.matches.delete(t.matchId);
      const c = this.challengeFor(t);
      if (c) this.challenges.delete(c.id);
    }
  }

  // Accepts a challenge: escrows the joiner's stake and starts the game.
  async acceptChallenge(challengeId: string, userId: string): Promise<Match> {
    const c = this.challenges.get(challengeId);
    if (!c) throw new BadRequest("NOT_FOUND", "That challenge is gone.", 404);
    if (c.creator.id === userId) {
      throw new BadRequest("OWN_CHALLENGE", "You can't join your own challenge.");
    }
    const match = this.matches.get(c.matchId);
    if (!match || match.state !== "awaiting_opponent") {
      throw new BadRequest("ALREADY_TAKEN", "Someone else already joined that game.", 409);
    }

    await this.ledger.hold(userId, c.stakeWei, match.id);
    match.black = this.playerOf(userId);
    match.start();
    if (c.inviteCode) this.byInvite.delete(c.inviteCode);
    this.challenges.delete(c.id);
    return match;
  }

  async cancelChallenge(challengeId: string, userId: string): Promise<void> {
    const c = this.challenges.get(challengeId);
    if (!c) return;
    if (c.creator.id !== userId) {
      throw new BadRequest("NOT_YOURS", "That isn't your challenge.", 403);
    }
    const m = this.matches.get(c.matchId);
    if (m && m.state !== "awaiting_opponent") {
      throw new BadRequest("ALREADY_STARTED", "That game has already started.");
    }
    await this.ledger.refund(c.matchId);
    this.matches.delete(c.matchId);
    if (c.inviteCode) this.byInvite.delete(c.inviteCode);
    this.challenges.delete(c.id);
  }

  async move(matchId: string, userId: string, uci: string): Promise<Match> {
    const m = this.match(matchId);
    m.move(userId, uci);
    this.market(matchId).recordHistory(m);
    await this.settleIfFinished(m);
    return m;
  }

  // Offers a draw, or accepts one the opponent already offered. Agreement
  // settles the game as a draw, which triggers the rematch.
  async offerDraw(matchId: string, userId: string): Promise<Match> {
    const m = this.match(matchId);
    m.offerDraw(userId);
    await this.settleIfFinished(m);
    return m;
  }

  async resign(matchId: string, userId: string): Promise<Match> {
    const m = this.match(matchId);
    m.resign(userId);
    await this.settleIfFinished(m);
    return m;
  }

  async placeBet(
    matchId: string,
    userId: string,
    selection: Selection,
    stakeWei: bigint,
    expectedOdds: number
  ) {
    const m = this.match(matchId);
    const mk = this.market(matchId);
    // Hold the money first: a bet that can't be funded must never enter the
    // book, or the prices it moves would be backed by nothing.
    await this.ledger.hold(userId, stakeWei, `bet:${matchId}`);
    try {
      const bet = mk.place(m, userId, selection, stakeWei, expectedOdds);
      mk.recordHistory(m);
      return bet;
    } catch (error) {
      await this.ledger.refund(`bet:${matchId}`);
      throw error;
    }
  }

  private settledMatches = new Set<string>();

  // Pays out a finished match exactly once: the pot to the winner less the
  // fee, or both stakes back on a draw, then every spectator bet.
  private async settleIfFinished(m: Match): Promise<void> {
    if (m.state !== "settled" || this.settledMatches.has(m.id)) return;
    this.settledMatches.add(m.id);

    const winner = m.winnerUserId();
    if (winner) {
      const { fee } = potBreakdown(m.stakeWei);
      await this.ledger.settle(m.id, winner, fee);
    } else {
      // A draw returns both stakes untouched; the house takes nothing. The
      // players then go straight into a rematch for the same stake.
      await this.ledger.refund(m.id);
      await this.startRematch(m);
    }

    const mk = this.markets.get(m.id);
    if (mk) {
      const payouts = mk.settle(m);
      // Every spectator stake was escrowed together, so it all releases to the
      // house first. Winners are then paid out of that account: losing stakes
      // stay behind as the book's profit, and a payout larger than the stakes
      // collected is covered by the house, which is what carries the risk.
      // Losing bets are not refunded, which an earlier version did by mistake.
      await this.ledger.settle(`bet:${m.id}`, HOUSE, 0n);
      for (const [userId, payout] of payouts) {
        await this.ledger.credit(HOUSE, -payout, `bet-payout:${m.id}`);
        await this.ledger.credit(userId, payout, `bet-win:${m.id}`);
      }
    }
  }

  // A drawn game goes straight into a rematch for the same stake and time
  // control, with colours swapped so neither player keeps the first move.
  // Both stakes were just returned by the draw, so they are escrowed again
  // here.
  //
  // If either player can no longer cover the stake, no rematch is created:
  // their money stays returned rather than being committed to a game they
  // cannot afford. Clients see rematchId stay null and offer the lobby.
  private async startRematch(drawn: Match): Promise<void> {
    const white = drawn.white;
    const black = drawn.black;
    if (!white || !black || drawn.rematchId) return;

    const stake = drawn.stakeWei;
    for (const p of [white, black]) {
      if ((await this.ledger.balanceOf(p.id)) < stake) return;
    }

    const rematch = new Match(id("m"), drawn.timeControl, stake);
    // Colours swap: whoever had black now opens.
    rematch.white = black;
    rematch.black = white;
    rematch.rematchOf = drawn.id;
    this.matches.set(rematch.id, rematch);

    await this.ledger.hold(black.id, stake, rematch.id);
    await this.ledger.hold(white.id, stake, rematch.id);
    rematch.start();

    drawn.rematchId = rematch.id;
  }

  // Hub figures, derived from real state.
  presence() {
    const live = this.liveMatches();
    const inQueue = [...this.tickets.values()].filter((t) => t.state === "searching").length;
    const playersOnline = live.reduce((n, m) => n + (m.white ? 1 : 0) + (m.black ? 1 : 0), 0);
    return [
      { game: "chess", playersOnline, inQueue, headline: null },
      {
        game: "draw",
        playersOnline: 0,
        inQueue: 0,
        headline: amount(0n, this.unitPriceUsd),
      },
    ];
  }
}
