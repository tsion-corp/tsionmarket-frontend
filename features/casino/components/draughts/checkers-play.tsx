"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DraughtsBoardView } from "@/features/casino/components/draughts/draughts-board";
import {
  useDraughtsMatch,
  remainingSeconds,
  useSeat,
} from "@/features/casino/hooks/use-draughts-match";
import { useCasinoWallet } from "@/features/casino/hooks/use-casino-wallet";
import {
  abortMatch,
  claimTimeout,
  declineTakeback,
  fetchPdn,
  joinMatch,
  offerDraw,
  requestRematch,
  requestTakeback,
  resignMatch,
  respondToDraw,
  submitMove,
} from "@/features/casino/lib/api/draughts";
import { MatchSocial } from "@/features/casino/components/draughts/match-social";
import { MatchChat } from "@/features/casino/components/draughts/match-chat";
import { SpectatorBetting } from "@/features/casino/components/draughts/spectator-betting";
import { ChessCashierLauncher } from "@/features/casino/components/chess/chess-cashier-launcher";
import { useChessCashierStatus } from "@/features/casino/hooks/use-chess-cashier";
import { exceedsUsdcBalance } from "@/features/casino/lib/api/cashier";
import { downloadText } from "@/features/casino/lib/draughts/download";
import {
  applyMove,
  capturedCounts,
  completedMove,
  legalMoves,
  moveToUci,
  movableFields,
  nextTargets,
  parseFen,
  parseUci,
  type DraughtsMove,
  type DraughtsSide,
} from "@/features/casino/lib/draughts/engine";
import type { DraughtsMatch } from "@/features/casino/lib/draughts/types";
import { friendlyError } from "@/lib/errors";
import { copyText } from "@/lib/clipboard";
import { toast } from "@/lib/toast";

const OTHER: Record<DraughtsSide, DraughtsSide> = { white: "black", black: "white" };

// One shared empty path, so "nothing selected" keeps a stable identity.
const EMPTY_PATH: number[] = [];

function formatClock(seconds: number): string {
  const total = Math.max(0, Math.ceil(seconds));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

function resultLine(match: DraughtsMatch, seat: DraughtsSide | null): string {
  const { result } = match;
  if (!result) return "";
  if (result.kind === "draw") {
    const why =
      result.reason === "agreement"
        ? "by agreement"
        : result.reason === "repetition"
          ? "by repetition"
          : "by the move rule";
    return `Drawn ${why}.`;
  }
  const why =
    result.reason === "resignation"
      ? "by resignation"
      : result.reason === "timeout"
        ? "on time"
        : result.reason === "abandoned"
          ? "by abandonment"
          : "with no moves left";
  const side = result.winner === "white" ? "White" : "Black";
  if (!seat) return `${side} wins ${why}.`;
  return result.winner === seat ? `You win ${why}.` : `You lose ${why}.`;
}

interface SeatBarProps {
  label: string;
  side: DraughtsSide;
  captured: number;
  clock: number;
  active: boolean;
  low: boolean;
}

function SeatBar({ label, side, captured, clock, active, low }: SeatBarProps) {
  return (
    <div
      className={`flex items-center justify-between rounded-xl border px-3 py-2 transition-colors ${
        active ? "border-white/25 bg-white/[0.07]" : "border-white/10 bg-white/[0.02]"
      }`}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <span
          aria-hidden
          className="h-3.5 w-3.5 shrink-0 rounded-full border border-black/40"
          style={{
            background:
              side === "white"
                ? "radial-gradient(circle at 32% 28%, #fff 0%, #e8e4d9 100%)"
                : "radial-gradient(circle at 32% 28%, #55555c 0%, #17171b 100%)",
          }}
        />
        <span className="truncate font-sans text-[14px] text-white/85">{label}</span>
        {captured > 0 ? (
          <span className="shrink-0 font-sans text-[12px] text-white/45 tabular-nums">
            +{captured}
          </span>
        ) : null}
      </div>
      <span
        className={`shrink-0 font-mono text-[15px] tabular-nums ${
          low && active ? "text-red-400" : active ? "text-white" : "text-white/50"
        }`}
      >
        {formatClock(clock)}
      </span>
    </div>
  );
}

export function CheckersPlay({ matchId }: { matchId: string }) {
  const router = useRouter();
  const { address } = useCasinoWallet();
  const wallet = address ?? null;
  const { match, loading, error, now, live, refresh, apply } = useDraughtsMatch(matchId);
  const { seat, myTurn, spectating } = useSeat(match, wallet);
  const cashier = useChessCashierStatus();

  // Joining a staked game locks the same amount the creator put up, so the
  // shortfall is caught here rather than as an upstream rejection after the
  // click. The service locks it on join; nothing is sent but the match id.
  const joinStake = match?.wager?.stakeUsdc ?? null;
  const shortForJoin = !!joinStake && exceedsUsdcBalance(joinStake, cashier.available);

  const [busy, setBusy] = useState(false);

  // A half-built move belongs to the position it was started from. Tagging it
  // with that FEN means the board moving on under it (the opponent replying, a
  // takeback) drops it during render, with no effect to clear it afterwards.
  const fen = match?.fen ?? null;
  const [selection, setSelection] = useState<{ fen: string | null; path: number[] }>({
    fen: null,
    path: [],
  });
  // Memoized so the derived board state below keeps a stable identity across
  // the clock's re-renders.
  const path = useMemo(
    () => (selection.fen === fen ? selection.path : EMPTY_PATH),
    [selection, fen]
  );
  const setPath = useCallback((next: number[]) => setSelection({ fen, path: next }), [fen]);

  const position = useMemo(() => (fen ? parseFen(fen) : null), [fen]);
  const turn = match?.turn ?? null;

  // Every legal move for the side to move. Only computed for the player whose
  // turn it is, since that is the only time the board is interactive.
  const moves = useMemo<DraughtsMove[]>(
    () => (position && myTurn ? legalMoves(position) : []),
    [position, myTurn]
  );

  // A move in progress is drawn on the board before it is sent, so the player
  // sees the jump they are building.
  const preview = useMemo(() => {
    if (!position || path.length < 2) return null;
    const move = completedMove(moves, path);
    return move ? applyMove(position, move) : null;
  }, [position, moves, path]);

  const board = preview?.board ?? position?.board ?? null;
  const targets = useMemo(() => nextTargets(moves, path), [moves, path]);
  const movable = useMemo(() => movableFields(moves), [moves]);

  // The pieces the path so far would take, marked while the player builds it.
  const doomed = useMemo(() => {
    if (path.length < 2) return [];
    const partial = moves.filter(
      (move) => path.every((field, i) => move.path[i] === field) && move.path.length >= path.length
    );
    // Only the captures common to every continuation are certain.
    const first = partial[0];
    if (!first) return [];
    const taken = first.captured.slice(0, path.length - 1);
    return taken;
  }, [moves, path]);

  const history = match?.moves;
  const lastMove = useMemo(() => {
    const san = history?.[history.length - 1];
    if (!san) return [];
    return parseUci(san.replace(/[^0-9]/gu, "")) ?? [];
  }, [history]);

  const send = useCallback(
    async (move: DraughtsMove) => {
      if (!wallet || !match) return;
      setBusy(true);
      try {
        const next = await submitMove(match.id, wallet, moveToUci(move), match);
        apply(next);
        setPath([]);
      } catch (cause) {
        toast.error(friendlyError(cause, "That move was refused."));
        // The server is the authority: reload rather than keep a board it
        // disagreed with.
        setPath([]);
        refresh();
      } finally {
        setBusy(false);
      }
    },
    [wallet, match, apply, refresh, setPath]
  );

  const onFieldClick = useCallback(
    (field: number) => {
      if (!myTurn || busy || !position) return;

      // Starting again on one of your own pieces always restarts the move.
      const piece = position.board[field];
      if (piece && piece.side === turn) {
        setPath(movable.includes(field) ? [field] : []);
        return;
      }
      if (path.length === 0) return;
      if (!targets.includes(field)) {
        setPath([]);
        return;
      }

      const next = [...path, field];
      const done = completedMove(moves, next);
      // A jump with more to take leaves the path open for the next click.
      if (done && nextTargets(moves, next).length === 0) void send(done);
      else setPath(next);
    },
    [myTurn, busy, position, turn, movable, path, targets, moves, send, setPath]
  );

  const act = useCallback(
    async (run: () => Promise<DraughtsMatch>, failure: string) => {
      if (busy) return;
      setBusy(true);
      try {
        apply(await run());
      } catch (cause) {
        toast.error(friendlyError(cause, failure));
      } finally {
        setBusy(false);
      }
    },
    [busy, apply]
  );

  if (loading && !match) {
    return <p className="py-16 text-center font-sans text-[14px] text-white/50">Loading game…</p>;
  }
  if (error && !match) {
    return <p className="py-16 text-center font-sans text-[14px] text-red-400">{error}</p>;
  }
  if (!match || !board) return null;

  const orientation: DraughtsSide = seat ?? "white";
  const captured = capturedCounts(board);
  const opponent = OTHER[orientation];
  const whiteName = match.white?.username ?? "Open seat";
  const blackName = match.black?.username ?? "Open seat";
  const nameOf = (side: DraughtsSide) => (side === "white" ? whiteName : blackName);

  const topClock = remainingSeconds(match, opponent, now);
  const bottomClock = remainingSeconds(match, orientation, now);
  const settled = match.state === "settled" || match.state === "cancelled";
  const waiting = match.state === "awaiting_opponent";
  const canJoin = waiting && !seat && !!wallet;
  const drawOfferedToMe = !!seat && match.drawOffered === OTHER[seat];
  const mustCapture = myTurn && moves.some((move) => move.captured.length > 0);

  return (
    // Board and chat sit side by side once there is room for both, the way the
    // chess screens read. Below that the chat drops under the board instead.
    <div className="mx-auto grid w-full max-w-[520px] grid-cols-1 gap-8 px-4 pb-10 xl:max-w-[980px] xl:grid-cols-[minmax(0,520px)_minmax(0,1fr)] xl:items-start">
      <div className="min-w-0">
        <div className="mb-3 flex items-center justify-between">
          <button
            onClick={() => router.push("/casino/checkers")}
            className="cursor-pointer font-sans text-[13px] text-white/50 hover:text-white/80"
          >
            ← Lobby
          </button>
          <span className="flex items-center gap-2 font-sans text-[12px] text-white/40">
            <span
              aria-hidden
              className={`h-1.5 w-1.5 rounded-full ${live ? "bg-emerald-400" : "bg-white/25"}`}
            />
            {match.timeControl}
            {match.wager ? ` · ${match.wager.stakeUsdc} USDC` : ""}
          </span>
        </div>

        <SeatBar
          label={nameOf(opponent)}
          side={opponent}
          captured={captured[OTHER[opponent]]}
          clock={topClock}
          active={match.state === "in_progress" && match.turn === opponent}
          low={topClock <= 10}
        />

        <div className="my-2">
          <DraughtsBoardView
            board={board}
            path={path}
            targets={targets}
            movable={myTurn ? movable : []}
            lastMove={lastMove}
            doomed={doomed}
            orientation={orientation}

            onFieldClick={myTurn && !busy ? onFieldClick : undefined}
          />
        </div>

        <SeatBar
          label={seat ? "You" : nameOf(orientation)}
          side={orientation}
          captured={captured[OTHER[orientation]]}
          clock={bottomClock}
          active={match.state === "in_progress" && match.turn === orientation}
          low={bottomClock <= 10}
        />

        {/* Status line: one sentence about what the board is waiting for. */}
        <p className="mt-3 min-h-[20px] text-center font-sans text-[13px] text-white/60">
          {settled
            ? resultLine(match, seat)
            : waiting
              ? "Waiting for an opponent to join."
              : myTurn
                ? mustCapture
                  ? "Your move. A capture is available, so you have to take."
                  : "Your move."
                : spectating
                  ? `${nameOf(match.turn)} to move.`
                  : "Waiting for your opponent."}
        </p>

        {/* Actions. Only what is possible right now is offered, so the bar never
          shows a button that would be refused. */}
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {canJoin ? (
            <button
              disabled={busy || shortForJoin}
              onClick={() =>
                act(() => joinMatch(match.id, wallet as string), "Couldn't join that game.")
              }
              className="text-ink cursor-pointer rounded-[14px] bg-white px-5 py-2.5 font-sans text-[14px] font-semibold hover:opacity-90 disabled:opacity-50"
            >
              {shortForJoin
                ? `Need ${joinStake} USDC`
                : joinStake
                  ? `Stake ${joinStake} USDC & join`
                  : "Join game"}
            </button>
          ) : null}

          {waiting && seat ? (
            <button
              onClick={async () => {
                await copyText(`${window.location.origin}/casino/checkers/play?match=${match.id}`);
                toast.success("Invite link copied.");
              }}
              className="cursor-pointer rounded-[14px] border border-white/15 px-4 py-2.5 font-sans text-[14px] text-white/80 hover:bg-white/5"
            >
              Copy invite
            </button>
          ) : null}

          {drawOfferedToMe ? (
            <>
              <button
                disabled={busy}
                onClick={() =>
                  act(
                    () => respondToDraw(match.id, wallet as string, true),
                    "Couldn't accept the draw."
                  )
                }
                className="text-ink cursor-pointer rounded-[14px] bg-white px-4 py-2.5 font-sans text-[14px] font-semibold hover:opacity-90 disabled:opacity-50"
              >
                Accept draw
              </button>
              <button
                disabled={busy}
                onClick={() =>
                  act(
                    () => respondToDraw(match.id, wallet as string, false),
                    "Couldn't decline the draw."
                  )
                }
                className="cursor-pointer rounded-[14px] border border-white/15 px-4 py-2.5 font-sans text-[14px] text-white/80 hover:bg-white/5"
              >
                Decline
              </button>
            </>
          ) : null}

          {seat && match.state === "in_progress" && !drawOfferedToMe ? (
            <>
              <button
                disabled={busy || match.drawOffered === seat}
                onClick={() =>
                  act(() => offerDraw(match.id, wallet as string), "Couldn't offer a draw.")
                }
                className="cursor-pointer rounded-[14px] border border-white/15 px-4 py-2.5 font-sans text-[14px] text-white/80 hover:bg-white/5 disabled:opacity-40"
              >
                {match.drawOffered === seat ? "Draw offered" : "Offer draw"}
              </button>
              {match.takeback.takebackable ? (
                <button
                  disabled={busy || match.takeback[seat]}
                  onClick={() =>
                    act(
                      () => requestTakeback(match.id, wallet as string),
                      "Couldn't ask for a takeback."
                    )
                  }
                  className="cursor-pointer rounded-[14px] border border-white/15 px-4 py-2.5 font-sans text-[14px] text-white/80 hover:bg-white/5 disabled:opacity-40"
                >
                  Takeback
                </button>
              ) : null}
              {match.takeback[OTHER[seat]] ? (
                <button
                  disabled={busy}
                  onClick={() =>
                    act(
                      () => declineTakeback(match.id, wallet as string),
                      "Couldn't decline the takeback."
                    )
                  }
                  className="cursor-pointer rounded-[14px] border border-white/15 px-4 py-2.5 font-sans text-[14px] text-white/80 hover:bg-white/5"
                >
                  Decline takeback
                </button>
              ) : null}
              {/* Only offered once the opponent has actually run out, so it can
                never be used to nudge a player who still has time. */}
              {remainingSeconds(match, OTHER[seat], now) <= 0 ? (
                <button
                  disabled={busy}
                  onClick={() =>
                    act(() => claimTimeout(match.id, wallet as string), "Couldn't claim the win.")
                  }
                  className="text-ink cursor-pointer rounded-[14px] bg-white px-4 py-2.5 font-sans text-[14px] font-semibold hover:opacity-90"
                >
                  Claim win on time
                </button>
              ) : null}
              <button
                disabled={busy}
                onClick={() =>
                  act(() => resignMatch(match.id, wallet as string), "Couldn't resign.")
                }
                className="cursor-pointer rounded-[14px] border border-red-500/30 px-4 py-2.5 font-sans text-[14px] text-red-400 hover:bg-red-500/10 disabled:opacity-40"
              >
                Resign
              </button>
            </>
          ) : null}

          {seat && waiting ? (
            <button
              disabled={busy}
              onClick={() =>
                act(() => abortMatch(match.id, wallet as string), "Couldn't abort the game.")
              }
              className="cursor-pointer rounded-[14px] border border-white/15 px-4 py-2.5 font-sans text-[14px] text-white/70 hover:bg-white/5"
            >
              Cancel game
            </button>
          ) : null}

          {seat && settled ? (
            match.rematch.nextMatchId ? (
              <button
                onClick={() =>
                  router.push(`/casino/checkers/play?match=${match.rematch.nextMatchId as string}`)
                }
                className="text-ink cursor-pointer rounded-[14px] bg-white px-5 py-2.5 font-sans text-[14px] font-semibold hover:opacity-90"
              >
                Go to rematch
              </button>
            ) : (
              <button
                disabled={busy || match.rematch.offeredBy === wallet}
                onClick={() =>
                  act(() => requestRematch(match.id, wallet as string), "Couldn't offer a rematch.")
                }
                className="text-ink cursor-pointer rounded-[14px] bg-white px-5 py-2.5 font-sans text-[14px] font-semibold hover:opacity-90 disabled:opacity-50"
              >
                {match.rematch.offeredBy === wallet ? "Rematch offered" : "Rematch"}
              </button>
            )
          ) : null}
        </div>

        {/* Move history in the service's own notation, which is what the PDN
          export and any analysis will show. */}
        {match.moves.length > 0 ? (
          <div className="mt-6">
            <div className="mb-2 flex items-baseline justify-between">
              <h2 className="font-sans text-[12px] tracking-wide text-white/40 uppercase">Moves</h2>
              <button
                onClick={async () => {
                  try {
                    const pdn = await fetchPdn(match.id);
                    downloadText(`checkers-${match.id.slice(0, 8)}.pdn`, pdn);
                  } catch (cause) {
                    toast.error(friendlyError(cause, "Couldn't export this game."));
                  }
                }}
                className="cursor-pointer font-sans text-[12px] text-white/40 hover:text-white/80"
              >
                Download PDN
              </button>
            </div>
            <ol className="flex flex-wrap gap-x-3 gap-y-1 font-mono text-[13px] text-white/60">
              {match.moves.map((san, i) => (
                <li key={`${i}-${san}`} className="tabular-nums">
                  <span className="text-white/30">{Math.floor(i / 2) + 1}.</span> {san}
                </li>
              ))}
            </ol>
          </div>
        ) : null}

        {/* A staked game locks funds, and a rematch asks for them again, so the
            balance stays reachable from the board itself. */}
        <div className="mt-6">
          <ChessCashierLauncher compact />
        </div>

        <MatchSocial matchId={match.id} wallet={wallet} isPlayer={!!seat} ply={match.ply} />
      </div>

      {/* The market and the live room. Sticky on the wide layout so both stay
          beside the board while the move list and notes scroll past. */}
      <aside className="flex min-w-0 flex-col gap-4 xl:sticky xl:top-6 xl:h-[calc(100vh-6rem)]">
        {/* Watchers get the market; the two seats cannot stake on their own game. */}
        {spectating ? (
          <SpectatorBetting match={match} wallet={wallet} className="shrink-0" />
        ) : null}
        <MatchChat match={match} wallet={wallet} className="h-[26rem] xl:min-h-0 xl:flex-1" />
      </aside>
    </div>
  );
}
