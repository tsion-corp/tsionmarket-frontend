import { Chess } from "chess.js";
import { BadRequest, potBreakdown, type TokenAmount, amount } from "./money.js";

// Server-authoritative chess. The position, the clocks and the result all live
// here. A client can only propose a move; this decides whether it happened.

export type Color = "w" | "b";
export type TimeControl = "3+2" | "5+3" | "10+0" | "15+10";

export const TIME_CONTROLS: TimeControl[] = ["3+2", "5+3", "10+0", "15+10"];

export function timeControlSeconds(tc: TimeControl): { base: number; increment: number } {
  const [minutes, increment] = tc.split("+").map(Number);
  return { base: (minutes ?? 5) * 60, increment: increment ?? 0 };
}

export interface Player {
  id: string;
  username: string;
  rating: number;
  walletAddress: string;
}

export type MatchState = "awaiting_opponent" | "in_progress" | "settled" | "cancelled";

export type MatchResult =
  | { kind: "checkmate"; winner: Color }
  | { kind: "resignation"; winner: Color }
  | { kind: "timeout"; winner: Color }
  | { kind: "draw"; reason: "stalemate" | "agreement" | "repetition" | "insufficient" };

export class Match {
  readonly id: string;
  state: MatchState = "awaiting_opponent";
  white: Player | null = null;
  black: Player | null = null;
  readonly timeControl: TimeControl;
  readonly stakeWei: bigint;
  result: MatchResult | null = null;
  spectatorCount = 0;
  readonly createdAt = new Date().toISOString();
  // Set when a drawn game spawns its rematch, so clients can follow on.
  rematchId: string | null = null;
  // Set on the rematch itself, pointing back at the game that was drawn.
  rematchOf: string | null = null;

  private game = new Chess();
  private clocks: Record<Color, number>;
  private increment: number;
  // When the side to move last had their clock read, so elapsed time can be
  // charged against them even if they never send another request.
  private lastTickAt: number;

  constructor(id: string, timeControl: TimeControl, stakeWei: bigint) {
    this.id = id;
    this.timeControl = timeControl;
    this.stakeWei = stakeWei;
    const { base, increment } = timeControlSeconds(timeControl);
    this.clocks = { w: base, b: base };
    this.increment = increment;
    this.lastTickAt = Date.now();
  }

  get turn(): Color {
    return this.game.turn();
  }

  get fen(): string {
    return this.game.fen();
  }

  get moves(): string[] {
    return this.game.history();
  }

  // Charges the side to move for the time actually elapsed, and flags them if
  // it has run out. Called before every read and every move, so a player who
  // walks away still loses on time.
  tick(): void {
    if (this.state !== "in_progress") {
      this.lastTickAt = Date.now();
      return;
    }
    const now = Date.now();
    const elapsed = (now - this.lastTickAt) / 1000;
    this.lastTickAt = now;
    const mover = this.turn;
    this.clocks[mover] = Math.max(0, this.clocks[mover] - elapsed);
    if (this.clocks[mover] === 0) {
      this.finish({ kind: "timeout", winner: mover === "w" ? "b" : "w" });
    }
  }

  clockSnapshot(): Record<Color, number> {
    return { w: Math.floor(this.clocks.w), b: Math.floor(this.clocks.b) };
  }

  colorOf(userId: string): Color | null {
    if (this.white?.id === userId) return "w";
    if (this.black?.id === userId) return "b";
    return null;
  }

  // Applies a move in coordinate notation ("e2e4", "e7e8q"). Rejects anything
  // illegal, out of turn, or from someone who is not in this game.
  move(userId: string, uci: string): void {
    this.tick();
    if (this.state !== "in_progress") {
      throw new BadRequest("MATCH_NOT_ACTIVE", "This game is not in progress.");
    }
    const color = this.colorOf(userId);
    if (!color) throw new BadRequest("NOT_A_PLAYER", "You are not playing in this game.", 403);
    if (color !== this.turn) throw new BadRequest("NOT_YOUR_TURN", "It is not your move.");

    const from = uci.slice(0, 2);
    const to = uci.slice(2, 4);
    const promotion = uci.length > 4 ? uci.slice(4, 5) : undefined;
    try {
      this.game.move({ from, to, promotion });
    } catch {
      throw new BadRequest("ILLEGAL_MOVE", "That move isn't legal.");
    }

    // Moving instead of replying withdraws any outstanding draw offer.
    this.drawOfferFrom = null;
    // The increment is credited to the player who just moved.
    this.clocks[color] = this.clocks[color] + this.increment;
    this.checkGameOver();
  }

  resign(userId: string): void {
    this.tick();
    if (this.state !== "in_progress") return;
    const color = this.colorOf(userId);
    if (!color) throw new BadRequest("NOT_A_PLAYER", "You are not playing in this game.", 403);
    this.finish({ kind: "resignation", winner: color === "w" ? "b" : "w" });
  }

  // Draw by agreement. The first call records an offer; the opponent calling
  // it accepts, and the game is drawn. Offering twice does nothing.
  private drawOfferFrom: Color | null = null;

  offerDraw(userId: string): { agreed: boolean } {
    this.tick();
    if (this.state !== "in_progress") {
      throw new BadRequest("MATCH_NOT_ACTIVE", "This game is not in progress.");
    }
    const color = this.colorOf(userId);
    if (!color) throw new BadRequest("NOT_A_PLAYER", "You are not playing in this game.", 403);

    if (this.drawOfferFrom && this.drawOfferFrom !== color) {
      this.finish({ kind: "draw", reason: "agreement" });
      return { agreed: true };
    }
    this.drawOfferFrom = color;
    return { agreed: false };
  }

  get drawOffered(): Color | null {
    return this.drawOfferFrom;
  }

  private checkGameOver(): void {
    if (this.game.isCheckmate()) {
      // The side to move is the one that got mated.
      this.finish({ kind: "checkmate", winner: this.turn === "w" ? "b" : "w" });
      return;
    }
    if (this.game.isStalemate()) this.finish({ kind: "draw", reason: "stalemate" });
    else if (this.game.isThreefoldRepetition()) this.finish({ kind: "draw", reason: "repetition" });
    else if (this.game.isInsufficientMaterial())
      this.finish({ kind: "draw", reason: "insufficient" });
  }

  private finish(result: MatchResult): void {
    this.result = result;
    this.state = "settled";
  }

  start(): void {
    this.state = "in_progress";
    this.lastTickAt = Date.now();
  }

  // Who won, as a user id, or null for a draw.
  winnerUserId(): string | null {
    if (!this.result || this.result.kind === "draw") return null;
    return this.result.winner === "w" ? (this.white?.id ?? null) : (this.black?.id ?? null);
  }

  // A rough evaluation from material only, used to seed the spectator market.
  // Positive favours white.
  materialBalance(): number {
    const values: Record<string, number> = { p: 1, n: 3, b: 3.2, r: 5, q: 9, k: 0 };
    let score = 0;
    for (const row of this.game.board()) {
      for (const square of row) {
        if (!square) continue;
        const v = values[square.type] ?? 0;
        score += square.color === "w" ? v : -v;
      }
    }
    return score;
  }

  toJson(unitPriceUsd: number): Record<string, unknown> {
    this.tick();
    const { pot } = potBreakdown(this.stakeWei);
    return {
      id: this.id,
      state: this.state,
      white: this.white,
      black: this.black,
      timeControl: this.timeControl,
      stake: amount(this.stakeWei, unitPriceUsd),
      pot: amount(pot, unitPriceUsd) satisfies TokenAmount,
      fen: this.fen,
      moves: this.moves,
      clocks: this.clockSnapshot(),
      clockUpdatedAt: new Date().toISOString(),
      turn: this.turn,
      result: this.result,
      rematchId: this.rematchId,
      rematchOf: this.rematchOf,
      drawOffered: this.drawOfferFrom,
      spectatorCount: this.spectatorCount,
      createdAt: this.createdAt,
    };
  }
}
