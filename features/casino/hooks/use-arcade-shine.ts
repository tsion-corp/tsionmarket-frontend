"use client";

// Where the arcade tells Shine that a game went the player's way.
//
// Every one of these games announces its result as DERIVED STATE — a react
// query fed by a socket frame and a poll, a row that flips a field, a phase a
// timer walks into. None of them is a resolved promise, so all of them re-fire
// on refetch, on remount and on tab refocus. The hooks here are the layer that
// turns that back into an event:
//
//   · the id is the game's own natural id, so the durable store in lib/shine
//     recognises a repeat across mounts and reloads (features/casino/lib/
//     shine/arcade.ts explains the choice per game);
//   · a ref holds what this mount has already reported, so a fifteen-second
//     poll or a re-render does not walk the same row again;
//   · and, except for ArkBall, a report needs EVIDENCE THE PLAYER WAS HERE
//     when the game resolved. Opening a match you finished last week must not
//     post it: the dedup store stops the second post of a game, never the
//     first, so a screen that treats history as news would publish a backlog
//     the moment Shine is first switched on.
//
// ArkBall has no live signal to wait for — the win is a field on a polled row
// — so a bounded settlement age stands in for presence. See
// ARKBALL_FRESH_WIN_MS.
//
// Nothing here decides whether Shine is on, whether the post was already made,
// or what the sentence says. reportShine owns all three, returns void and
// never throws, so no failure in here can reach the game.

import { useEffect, useRef } from "react";
import type { ChessColor } from "@/features/casino/lib/api/types";
import type { DraughtsSide } from "@/features/casino/lib/draughts/engine";
import {
  arkballShineEvent,
  chessShineEvent,
  draughtsShineEvent,
  vaultShineEvent,
  type ChessShineMatch,
  type DraughtsShineMatch,
} from "@/features/casino/lib/shine/arcade";
import type { LotteryTicket } from "@/lib/api/schemas/lottery";
import { reportShine } from "@/lib/shine";

/**
 * A finished chess match, reported once.
 *
 * Both chess resolutions call this — the lichess round controller and the
 * native play screen — and they run side by side on the same react-query
 * cache. That is deliberate rather than tolerated: both hand over the same
 * `match.id`, so whichever gets there first posts and the store answers the
 * other.
 *
 * `you` is the seat, already null for a spectator at both call sites.
 */
export function useChessShine(
  match: ChessShineMatch | null | undefined,
  you: ChessColor | null
): void {
  const sawLive = useRef(false);
  const reported = useRef<string | null>(null);
  const matchId = match?.id ?? null;

  // A new match on the same mount starts its own history.
  useEffect(() => {
    sawLive.current = false;
    reported.current = null;
  }, [matchId]);

  useEffect(() => {
    if (!match) return;
    if (match.state === "in_progress") {
      sawLive.current = true;
      return;
    }
    // Not watched to the end: this is a finished game being opened, which is
    // history. It has a result, but it is not news and must not be posted.
    if (!sawLive.current) return;
    if (reported.current === match.id) return;

    const event = chessShineEvent(match, you);
    if (!event) return;
    reported.current = match.id;
    reportShine(event);
  }, [match, you]);
}

/**
 * A finished draughts match, reported once.
 *
 * The screen's own result handling is guarded by a single per-mount ref keyed
 * on the match id and nothing else, so it fires for a settled match opened
 * cold. This keeps its own presence flag rather than borrowing that one.
 */
export function useDraughtsShine(
  match: DraughtsShineMatch | null | undefined,
  seat: DraughtsSide | null
): void {
  const sawLive = useRef(false);
  const reported = useRef<string | null>(null);
  const matchId = match?.id ?? null;

  useEffect(() => {
    sawLive.current = false;
    reported.current = null;
  }, [matchId]);

  useEffect(() => {
    if (!match) return;
    if (match.state === "in_progress") {
      sawLive.current = true;
      return;
    }
    if (!sawLive.current) return;
    if (reported.current === match.id) return;

    const event = draughtsShineEvent(match, seat);
    if (!event) return;
    reported.current = match.id;
    reportShine(event);
  }, [match, seat]);
}

/**
 * A won vault round, reported once.
 *
 * `won` is the screen's own reveal reaching "you won", which is the single
 * point all three announcement paths converge on: the live reveal, the
 * winners-feed fallback, and the settlement that follows either. Critically it
 * is also PAST THE BACK-OUT — the live reveal re-reads the status after its
 * suspense and abandons the round when a wager landed at the buzzer, and it
 * does that before the phase ever becomes "won". Reporting from the round-end
 * signal instead would post a win that the very next check retracts.
 */
export function useVaultShine(gameId: number, won: boolean): void {
  const reported = useRef<number | null>(null);

  useEffect(() => {
    if (!won) return;
    if (reported.current === gameId) return;
    reported.current = gameId;
    reportShine(vaultShineEvent(gameId));
  }, [gameId, won]);
}

/**
 * Winning ArkBall tickets, each reported once.
 *
 * The tickets query refetches every fifteen seconds and serves the wallet's
 * last fifty tickets every time, so the naive reading of this list reports
 * every win the player has ever had, on every poll, forever. Two things stop
 * that: the ref below, which is what keeps a poll from walking the same row
 * twice, and the settlement-age bound inside `arkballShineEvent`, which is
 * what keeps a first run from posting a backlog the empty dedup store cannot
 * catch.
 */
export function useArkballShine(tickets: readonly LotteryTicket[]): void {
  const reported = useRef(new Set<string>());

  useEffect(() => {
    const now = Date.now();
    for (const ticket of tickets) {
      if (reported.current.has(ticket.id)) continue;
      const event = arkballShineEvent(ticket, now);
      if (!event) continue;
      reported.current.add(ticket.id);
      reportShine(event);
    }
  }, [tickets]);
}
