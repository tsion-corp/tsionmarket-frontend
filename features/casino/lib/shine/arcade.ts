// The facts the arcade hands to Shine, and nothing else.
//
// Every function here is pure: a settled game in, a `ShineEvent` or `null`
// out. The screens below only decide WHEN to ask; what a post may claim is
// decided once, here, where it can be read in one sitting and tested without
// mounting a board.
//
// THREE RULES, and every branch below is one of them.
//
// 1. A loss posts nothing, a spectator posts nothing, an aborted game posts
//    nothing. Only a win or a draw returns an event, and only for someone who
//    actually held a seat. `chessGameOverPresentation` reports "draw" for a
//    spectator too, because a draw is a property of the game rather than of
//    the viewer, so the seat is checked separately from the outcome.
//
// 2. The id is stable and unique per resolved game. It is the whole defence
//    against a poll or a socket announcing the same win twice: the durable
//    store in lib/shine keys on (account, service, id), so the same game must
//    produce the same string on every mount, every refetch and every reload.
//    Arcade ids are namespaced with the catalogue's game id because all six
//    games share one Shine service, and a vault round number is a small
//    integer that could otherwise collide with a ticket id.
//
// 3. No figure is ever built from a float. Stakes and payouts arrive as
//    decimal strings; they go to bigint base units and stay there until
//    lib/shine/money renders the percentage. `Number(stake)` is what
//    lib/analytics/game-result does, and analytics may round — a public post
//    that cannot be edited may not.

import { CASINO_GAMES } from "@/features/casino/lib/games";
import type { ChessColor, ChessComputerWager, ChessMatch } from "@/features/casino/lib/api/types";
import type { ArkjetBet, ChickenSession } from "@/features/casino/lib/api/arkjet";
import type { DraughtsSide } from "@/features/casino/lib/draughts/engine";
import type { DraughtsMatch } from "@/features/casino/lib/draughts/types";
import { chessGameOverPresentation } from "@/features/casino/lib/chess/game-over";
import type { LotteryTicket } from "@/lib/api/schemas/lottery";
import { pnlPercentFromBaseUnits, type PnlPercent, type ShineEvent } from "@/lib/shine";
import { toBaseUnits } from "@/lib/trade/math";

/**
 * The scale every stake and payout is compared at.
 *
 * Not a currency's own decimals: the two sides of a return are divided by each
 * other, so the scale cancels and only has to be wide enough to lose nothing.
 * Eighteen covers USDC's six and the vault's eighteen alike, and `toBaseUnits`
 * truncates anything finer — which no settlement string carries.
 */
const RATIO_DECIMALS = 18;

/**
 * A ticket that settled more than this ago is history, not news.
 *
 * ArkBall is the one arcade game with no moment: a win is a field on a row
 * that polls every fifteen seconds, so the "event" is the first time this app
 * sees `status === "won"` (ADR-2026-09-24 section 4). Without a bound, the
 * first person to open ArkBall after Shine ships posts every win they have
 * ever had, all at once, because the dedup store has no record of any of them
 * — the store stops the SECOND post, not the first.
 *
 * A Shine post carries no date and the square stamps it now, so "Won at
 * ArkBall" a week late reads as a win that just happened. A day is where that
 * stops being true. The cost is a post missed by someone who does not open the
 * page for a day, and a missed post can still be written by hand.
 */
export const ARKBALL_FRESH_WIN_MS = 24 * 60 * 60 * 1000;

/** The catalogue's own name for a game, which is what the post says. */
function gameName(gameId: string): string {
  const listed = CASINO_GAMES.find((game) => game.id === gameId);
  // The catalogue is the arcade's own list and every id below is in it; the
  // id is a readable last resort rather than a thrown error inside a share.
  return listed?.name ?? gameId;
}

/**
 * The dedup id for one resolved game.
 *
 * Namespaced by catalogue id: six games post under the single "arcade"
 * service, and `42` as a vault round has to be a different key from `42` as
 * anything else.
 */
export function arcadeShineId(gameId: string, naturalId: string): string {
  return `${gameId}:${naturalId}`;
}

/** A return on a stake, both sides as the service's own decimal strings. */
function returnOnStake(stake: string, payout: string): PnlPercent | null {
  return pnlPercentFromBaseUnits(
    toBaseUnits(stake, RATIO_DECIMALS),
    toBaseUnits(payout, RATIO_DECIMALS)
  );
}

/** A won or drawn arcade game, ready for `reportShine`. */
function arcadeEvent(
  gameId: string,
  naturalId: string,
  outcome: "won" | "drawn",
  pnl: PnlPercent | null
): ShineEvent {
  return {
    service: "arcade",
    id: arcadeShineId(gameId, naturalId),
    game: gameName(gameId),
    outcome,
    pnl,
  };
}

/**
 * What a won head-to-head wager paid, as a return on the one player's stake.
 *
 * Both seats lock the same amount, so the pot is twice the stake and the
 * winner takes the pot less the platform's cut — the same arithmetic
 * `wagerBreakdown` shows a player before they commit, in bigint so a stake
 * with six decimal places survives it.
 *
 * Null when the fee was never snapshotted onto the match. A post cannot be
 * corrected, so an unknown fee is a missing percentage rather than a guessed
 * one; the 10% default that lib/analytics falls back to would be a made-up
 * number in a permanent public sentence.
 */
function headToHeadWinPnl(stakeUsdc: string | null, feeBps: number | null): PnlPercent | null {
  if (stakeUsdc === null || feeBps === null || !Number.isFinite(feeBps) || feeBps < 0) return null;
  const stake = toBaseUnits(stakeUsdc, RATIO_DECIMALS);
  if (stake <= 0n) return null;
  const pot = stake * 2n;
  const fee = (pot * BigInt(Math.round(feeBps))) / 10_000n;
  return pnlPercentFromBaseUnits(stake, pot - fee);
}

/**
 * What a won wager against the engine paid.
 *
 * Not a two-sided pot: the service funds a reward scaled by engine level.
 * `payoutUsdc` is the settled figure and is empty until the money flip lands,
 * so the quote the same service gave for this wager stands in — it is what the
 * player was shown, and it is the service's own number either way.
 */
function computerWinPnl(wager: ChessComputerWager): PnlPercent | null {
  const settled = toBaseUnits(wager.payoutUsdc, RATIO_DECIMALS);
  const payout = settled > 0n ? wager.payoutUsdc : wager.potentialPayoutUsdc;
  return returnOnStake(wager.stakeUsdc, payout);
}

/**
 * The part of a chess match a Shine post is built from.
 *
 * A narrow `Pick` rather than the whole match, so what a post can possibly
 * depend on is visible in one line — and so a test can state a finished game
 * without inventing a board, a clock and a rating history.
 */
export type ChessShineMatch = Pick<
  ChessMatch,
  | "id"
  | "state"
  | "result"
  | "resultReason"
  | "finishedAt"
  | "stakeUsdc"
  | "wagerFeeBps"
  | "computer"
>;

/** The same for draughts. */
export type DraughtsShineMatch = Pick<
  DraughtsMatch,
  "id" | "state" | "result" | "wager" | "computer"
>;

/**
 * A finished chess match, from the seat this viewer holds.
 *
 * WHICH FLIP THIS READS. The result and the money are two separate flips:
 * `match.wagerStatus` turns "settled" some time after `match.result` arrives.
 * This reads the RESULT flip, because the percentage does not come from the
 * payout — it comes from `stakeUsdc` and `wagerFeeBps`, both snapshotted when
 * the wager was created and unchanged by settlement. Waiting for the second
 * flip would delay the post, would never fire at all for a free game, and
 * would not make the number any truer.
 */
export function chessShineEvent(match: ChessShineMatch, you: ChessColor | null): ShineEvent | null {
  // A spectator holds no seat, and a drawn game reads as "draw" to everyone
  // watching it, so the seat is checked before the outcome is trusted.
  if (you === null) return null;
  // "settled" is the finished state; "cancelled" is an abort, and an
  // unfinished match has nothing to say whatever result is attached to it.
  if (match.state !== "settled") return null;

  const presentation = chessGameOverPresentation(match, you);
  if (presentation.outcome === "draw") {
    // A draw refunds each side its own stake. Nothing was returned, so there
    // is no return to state — and the computer's draw payout, where there is
    // one, is a consolation rather than a return on a settled bet.
    return arcadeEvent("chess", match.id, "drawn", null);
  }
  if (presentation.outcome !== "win") return null;

  const computerWager = match.computer?.wager ?? null;
  const pnl = computerWager
    ? computerWinPnl(computerWager)
    : headToHeadWinPnl(match.stakeUsdc, match.wagerFeeBps ?? null);
  return arcadeEvent("chess", match.id, "won", pnl);
}

/**
 * A finished draughts match, from the seat this viewer holds.
 *
 * Draughts carries no `chessGameOverPresentation`, so the same three checks
 * are made in the same order: a cancelled match is aborted rather than drawn,
 * a seatless viewer is a spectator, and only the winner's seat wins.
 */
export function draughtsShineEvent(
  match: DraughtsShineMatch,
  seat: DraughtsSide | null
): ShineEvent | null {
  if (seat === null) return null;
  // A cancelled match has no result worth sharing even when one is attached.
  if (match.state !== "settled") return null;
  const result = match.result;
  if (!result) return null;

  if (result.kind === "draw") return arcadeEvent("checkers", match.id, "drawn", null);
  if (result.winner !== seat) return null;

  const computerWager = match.computer?.wager ?? null;
  const pnl = computerWager
    ? returnOnStake(
        computerWager.stakeUsdc,
        toBaseUnits(computerWager.payoutUsdc, RATIO_DECIMALS) > 0n
          ? computerWager.payoutUsdc
          : computerWager.potentialPayoutUsdc
      )
    : headToHeadWinPnl(match.wager?.stakeUsdc ?? null, match.wager?.feeBps ?? null);
  return arcadeEvent("checkers", match.id, "won", pnl);
}

/**
 * A won vault round, by round number.
 *
 * `gameId` and not `settlementTx`: the round is announced by the live reveal
 * before anything has settled, so at the moment this app knows the player won
 * there is no settlement hash to key on. The winners feed carries one and the
 * socket settlement carries one, and all three paths converge on the same
 * round number — which is the only id all three have.
 *
 * No percentage. A vault round has no single stake: a player may wager any
 * number of times at any size, and the screen's own figures (the pot, the
 * prize, the entry) are float dollar estimates priced off a token feed. There
 * is no constructor in lib/shine/money that will take one, deliberately, and
 * inventing one for a post nobody can correct is the exact mistake the ADR is
 * written against.
 */
export function vaultShineEvent(gameId: number): ShineEvent {
  return arcadeEvent("last-standing", String(gameId), "won", null);
}

/**
 * A winning ArkBall ticket, on the first poll that shows it as won.
 *
 * `settledAt` is required, not decorative: a row marked won with no
 * settlement time has not been paid, and a bounded-age settlement is what
 * keeps a first run from posting a year of history (see
 * ARKBALL_FRESH_WIN_MS).
 */
export function arkballShineEvent(ticket: LotteryTicket, nowMs: number): ShineEvent | null {
  if (ticket.status !== "won") return null;
  if (ticket.settledAt === null) return null;
  const settledAt = Date.parse(ticket.settledAt);
  if (!Number.isFinite(settledAt)) return null;
  const age = nowMs - settledAt;
  // A settlement stamped in the future is a clock disagreement, not a fresher
  // win; only the past side is bounded.
  if (age > ARKBALL_FRESH_WIN_MS) return null;
  return arcadeEvent(
    "arkball",
    ticket.id,
    "won",
    returnOnStake(ticket.priceUsdc, ticket.payoutUsdc)
  );
}

/**
 * An Arkjet bet the player cashed out, from the mutation that cashed it.
 *
 * Read from the resolved response and not from a row flipping to CASHED_OUT,
 * which the bets query re-serves every two seconds while a round is live.
 *
 * A cash-out at or below the stake is not a win. The minimum multiplier can
 * sit at 1.00, and "Won at Arkjet" over a break-even press is a post the
 * player did not earn and cannot delete.
 */
export function arkjetShineEvent(bet: ArkjetBet): ShineEvent | null {
  if (bet.status !== "CASHED_OUT" || bet.payout === null) return null;
  const stake = toBaseUnits(bet.amount, RATIO_DECIMALS);
  const payout = toBaseUnits(bet.payout, RATIO_DECIMALS);
  if (stake <= 0n || payout <= stake) return null;
  return arcadeEvent("arkjet", bet.betId, "won", pnlPercentFromBaseUnits(stake, payout));
}

/** A Pilot Chicken session the player cashed out. Same reading as Arkjet. */
export function chickenShineEvent(session: ChickenSession): ShineEvent | null {
  if (session.status !== "cashed_out" || session.payout === null) return null;
  const stake = toBaseUnits(session.amount, RATIO_DECIMALS);
  const payout = toBaseUnits(session.payout, RATIO_DECIMALS);
  if (stake <= 0n || payout <= stake) return null;
  return arcadeEvent("chicken", session.sessionId, "won", pnlPercentFromBaseUnits(stake, payout));
}
