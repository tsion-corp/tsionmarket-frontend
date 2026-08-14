"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DraughtsBoardView } from "@/features/casino/components/draughts/draughts-board";
import { DraughtsMoveTable } from "@/features/casino/components/draughts/draughts-move-table";
import {
  DRAUGHTS_PANEL_BUTTON_CLASS,
  DRAUGHTS_PANEL_HEADER_CLASS,
  DraughtsWorkspace,
} from "@/features/casino/components/draughts/draughts-workspace";
import { MatchChat } from "@/features/casino/components/draughts/match-chat";
import { MatchComments } from "@/features/casino/components/draughts/match-comments";
import { SpectatorBetting } from "@/features/casino/components/draughts/spectator-betting";
import { ChessCashierLauncher } from "@/features/casino/components/chess/chess-cashier-launcher";
import { armAudioUnlock, playGameEndSound, playMoveSound } from "@/features/casino/lib/chess/sound";
import {
  remainingSeconds,
  useDraughtsMatch,
  useSeat,
} from "@/features/casino/hooks/use-draughts-match";
import { useCasinoWallet } from "@/features/casino/hooks/use-casino-wallet";
import { useChessCashierStatus } from "@/features/casino/hooks/use-chess-cashier";
import {
  abortMatch,
  claimTimeout,
  continueComputerCoachReview,
  declineTakeback,
  extendMatchTime,
  fetchComputerCoachState,
  fetchPdn,
  joinMatch,
  offerDraw,
  requestComputerCoachHint,
  requestComputerHint,
  requestRematch,
  requestTakeback,
  resignMatch,
  respondToDraw,
  submitComputerCoachMove,
  submitMove,
  undoComputerCoachReview,
} from "@/features/casino/lib/api/draughts";
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
import { variantOption } from "@/features/casino/lib/draughts/variants";
import type {
  DraughtsCoachHint,
  DraughtsCoachMoveReview,
  DraughtsComputerCoachState,
  DraughtsMatch,
  DraughtsPlayerRating,
} from "@/features/casino/lib/draughts/types";
import { gamePayout } from "@/lib/analytics/game-result";
import { track } from "@/lib/analytics/mixpanel";
import { copyText } from "@/lib/clipboard";
import { friendlyError } from "@/lib/errors";
import { toast } from "@/lib/toast";

const OTHER: Record<DraughtsSide, DraughtsSide> = { white: "black", black: "white" };
const EMPTY_PATH: number[] = [];
const EXTENSION_SECONDS = 300;

type PanelTab = "game" | "chat" | "comments" | "market";

function formatClock(seconds: number, unlimited: boolean): string {
  if (unlimited) return "∞";
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
    return `Draw ${why}`;
  }
  const why =
    result.reason === "resignation"
      ? "by resignation"
      : result.reason === "timeout"
        ? "on time"
        : result.reason === "abandoned"
          ? "by abandonment"
          : "with no legal moves";
  if (!seat) return `${result.winner === "white" ? "White" : "Black"} wins ${why}`;
  return result.winner === seat ? `You win ${why}` : `You lose ${why}`;
}

function ratingText(rating?: DraughtsPlayerRating): string | null {
  if (!rating) return null;
  if (rating.rating === null) return null;
  return `${rating.rating}${rating.provisional ? "?" : ""}`;
}

function PlayerClock({
  name,
  side,
  rating,
  captured,
  clock,
  unlimited,
  active,
  compact = false,
  desktopOnly = false,
}: {
  name: string;
  side: DraughtsSide;
  rating?: DraughtsPlayerRating;
  captured: number;
  clock: number;
  unlimited: boolean;
  active: boolean;
  compact?: boolean;
  desktopOnly?: boolean;
}) {
  const shownRating = ratingText(rating);
  return (
    <div
      className={`${desktopOnly ? "hidden md:flex" : "flex"} min-w-0 items-stretch border-white/10 ${
        compact ? "border-y bg-black/20" : "border-b"
      }`}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2.5 px-3 py-2.5">
        <span
          aria-hidden
          className={`h-2.5 w-2.5 shrink-0 rounded-full border ${
            side === "white" ? "border-black/20 bg-zinc-100" : "border-white/25 bg-zinc-950"
          }`}
        />
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold text-white/82">{name}</p>
          <p className="mt-0.5 text-[11px] text-white/35">
            {shownRating ? `${shownRating} rating` : side === "white" ? "White" : "Black"}
            {rating?.diff !== null && rating?.diff !== undefined ? (
              <span className={rating.diff >= 0 ? "ml-1 text-emerald-400" : "ml-1 text-red-400"}>
                {rating.diff >= 0 ? "+" : ""}
                {rating.diff}
              </span>
            ) : null}
            {captured > 0 ? <span className="ml-1">· +{captured}</span> : null}
          </p>
        </div>
      </div>
      <div
        className={`flex min-w-[92px] items-center justify-end px-3 font-mono tabular-nums transition-colors ${
          compact ? "text-[18px]" : "text-[22px]"
        } ${active ? "bg-white text-zinc-950" : "bg-white/[0.055] text-white/45"}`}
      >
        {formatClock(clock, unlimited)}
      </div>
    </div>
  );
}

function Feedback({
  match,
  seat,
  myTurn,
  spectating,
  mustCapture,
  review,
  hint,
  onContinue,
  onTryAgain,
  busy,
}: {
  match: DraughtsMatch;
  seat: DraughtsSide | null;
  myTurn: boolean;
  spectating: boolean;
  mustCapture: boolean;
  review: DraughtsCoachMoveReview | null;
  hint: DraughtsCoachHint | null;
  onContinue: () => void;
  onTryAgain: () => void;
  busy: boolean;
}) {
  const settled = match.state === "settled" || match.state === "cancelled";
  const waiting = match.state === "awaiting_opponent";
  const computerThinking =
    match.state === "in_progress" && match.computer !== null && match.turn === match.computer.side;
  const reviewIsBad = review?.status === "review";
  const icon = reviewIsBad ? "×" : settled ? (match.result?.kind === "draw" ? "=" : "✓") : "";
  const title = reviewIsBad
    ? review.classification === "blunder"
      ? "That loses too much"
      : "There is a better move"
    : settled
      ? resultLine(match, seat)
      : waiting
        ? "Waiting for an opponent"
        : computerThinking
          ? `${match.computer?.name ?? "Computer"} is thinking…`
          : myTurn
            ? mustCapture
              ? "Your turn · capture required"
              : "Your turn"
            : spectating
              ? `${match.turn === "white" ? "White" : "Black"} to move`
              : "Opponent's turn";
  const detail = reviewIsBad
    ? review.message
    : (hint?.message ??
      (waiting
        ? "Share the invite link. The board starts for both players as soon as the second seat joins."
        : settled
          ? match.rating?.rated
            ? "The result and rating change are final."
            : "The result is final."
          : mustCapture
            ? "Draughts requires a capture whenever one is available."
            : ""));

  return (
    <div className="border-b border-white/10 px-4 py-4">
      <div className="flex items-start gap-3">
        {icon ? (
          <span
            aria-hidden
            className={`text-[38px] leading-none ${reviewIsBad ? "text-red-400" : "text-lime-400"}`}
          >
            {icon}
          </span>
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="text-[16px] font-semibold text-white/88">{title}</p>
          {detail ? <p className="mt-1 text-[12px] leading-5 text-white/45">{detail}</p> : null}
        </div>
      </div>
      {reviewIsBad ? (
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={busy || !review.canUndo}
            onClick={onTryAgain}
            className={DRAUGHTS_PANEL_BUTTON_CLASS}
          >
            Try again
          </button>
          <button
            type="button"
            disabled={busy || !review.canContinue}
            onClick={onContinue}
            className={DRAUGHTS_PANEL_BUTTON_CLASS}
          >
            Play it anyway
          </button>
        </div>
      ) : null}
    </div>
  );
}

function TabButton({
  active,
  children,
  onClick,
}: React.PropsWithChildren<{ active: boolean; onClick: () => void }>) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative h-12 cursor-pointer px-4 text-[12px] font-semibold transition-colors ${
        active ? "text-white" : "text-white/38 hover:text-white/70"
      }`}
    >
      {children}
      {active ? <span className="absolute inset-x-3 bottom-0 h-0.5 bg-white/75" /> : null}
    </button>
  );
}

export function CheckersPlay({ matchId }: { matchId: string }) {
  const router = useRouter();
  const { address } = useCasinoWallet();
  const wallet = address ?? null;
  const { match, loading, error, now, live, refresh, apply } = useDraughtsMatch(matchId);
  const { seat, myTurn, spectating } = useSeat(match, wallet);
  const cashier = useChessCashierStatus();
  const joinStake = match?.wager?.stakeUsdc ?? null;
  const shortForJoin = !!joinStake && exceedsUsdcBalance(joinStake, cashier.available);

  useEffect(() => {
    armAudioUnlock();
  }, []);

  const previousPly = useRef<number | null>(null);
  const currentPly = match?.ply ?? null;
  const latestSan = match?.moves[match.moves.length - 1] ?? "";
  useEffect(() => {
    if (currentPly === null) return;
    if (previousPly.current !== null && currentPly > previousPly.current) {
      playMoveSound(latestSan.includes("x") ? "capture" : "move");
    }
    previousPly.current = currentPly;
  }, [currentPly, latestSan]);

  const soundedResult = useRef<string | null>(null);
  useEffect(() => {
    if (!match?.result || !seat) return;
    if (match.state !== "settled" && match.state !== "cancelled") return;
    if (soundedResult.current === match.id) return;
    soundedResult.current = match.id;
    const outcome =
      match.result.kind === "draw" ? "draw" : match.result.winner === seat ? "win" : "loss";
    playGameEndSound(outcome);
  }, [match?.id, match?.result, match?.state, seat]);

  const reportedResult = useRef<string | null>(null);
  useEffect(() => {
    if (!match?.result || !seat) return;
    if (match.state !== "settled" && match.state !== "cancelled") return;
    if (reportedResult.current === match.id) return;
    reportedResult.current = match.id;
    const outcome =
      match.result.kind === "draw" ? "draw" : match.result.winner === seat ? "win" : "loss";
    const reason =
      match.result.kind === "draw"
        ? ("draw" as const)
        : match.result.reason === "resignation"
          ? ("resign" as const)
          : match.result.reason === "timeout"
            ? ("timeout" as const)
            : match.result.reason === "abandoned"
              ? ("abandoned" as const)
              : ("no_moves" as const);
    track("game_result", {
      game: "checkers",
      result: outcome,
      reason,
      ...gamePayout(match.wager?.stakeUsdc, outcome, match.wager?.feeBps ?? 500),
    });
  }, [seat, match?.id, match?.state, match?.result, match?.wager]);

  const [busy, setBusy] = useState(false);
  const [panelTab, setPanelTab] = useState<PanelTab>("game");
  const [coachState, setCoachState] = useState<DraughtsComputerCoachState | null>(null);
  const [coachReview, setCoachReview] = useState<DraughtsCoachMoveReview | null>(null);
  const [coachHint, setCoachHint] = useState<DraughtsCoachHint | null>(null);
  const [hintPath, setHintPath] = useState<number[]>([]);

  const fen = match?.fen ?? null;
  const variant = match?.variant ?? "standard";
  const [selection, setSelection] = useState<{ fen: string | null; path: number[] }>({
    fen: null,
    path: [],
  });
  const path = useMemo(
    () => (selection.fen === fen ? selection.path : EMPTY_PATH),
    [selection, fen]
  );
  const setPath = useCallback((next: number[]) => setSelection({ fen, path: next }), [fen]);
  const position = useMemo(() => (fen ? parseFen(fen, variant) : null), [fen, variant]);
  const turn = match?.turn ?? null;
  const moves = useMemo<DraughtsMove[]>(
    () =>
      position && myTurn && !coachReview?.status?.includes("review") ? legalMoves(position) : [],
    [position, myTurn, coachReview]
  );
  const preview = useMemo(() => {
    if (!position || path.length < 2) return null;
    const move = completedMove(moves, path);
    return move ? applyMove(position, move) : null;
  }, [position, moves, path]);
  const board = preview?.board ?? position?.board ?? null;
  const targets = useMemo(() => nextTargets(moves, path), [moves, path]);
  const movable = useMemo(() => movableFields(moves), [moves]);
  const doomed = useMemo(() => {
    if (path.length < 2) return [];
    const partial = moves.filter(
      (move) =>
        path.every((field, index) => move.path[index] === field) && move.path.length >= path.length
    );
    return partial[0]?.captured.slice(0, path.length - 1) ?? [];
  }, [moves, path]);
  const history = match?.moves;
  const lastMove = useMemo(() => {
    const san = history?.[history.length - 1];
    if (!san) return [];
    return parseUci(san.replace(/[^0-9]/gu, ""), variant) ?? [];
  }, [history, variant]);

  const coachEnabled = !!match?.computer?.coachEnabled && !!wallet;
  const activeMatchId = match?.id;
  const activeMatchPly = match?.ply;
  useEffect(() => {
    if (!coachEnabled || !activeMatchId || !wallet) return;
    let current = true;
    fetchComputerCoachState(activeMatchId, wallet)
      .then((state) => {
        if (!current) return;
        setCoachState(state);
        setCoachReview(state.pendingReview);
      })
      .catch(() => {
        // Live play remains usable if the optional coach snapshot is unavailable.
      });
    return () => {
      current = false;
    };
  }, [activeMatchId, activeMatchPly, coachEnabled, wallet]);

  const send = useCallback(
    async (move: DraughtsMove) => {
      if (!wallet || !match) return;
      setBusy(true);
      setCoachHint(null);
      setHintPath([]);
      try {
        if (match.computer?.coachEnabled) {
          const review = await submitComputerCoachMove(
            match.id,
            wallet,
            moveToUci(move),
            match.ply,
            crypto.randomUUID()
          );
          setCoachReview(review);
          if (review.matchState) apply(review.matchState);
        } else {
          apply(await submitMove(match.id, wallet, moveToUci(move), match));
        }
        setPath([]);
      } catch (cause) {
        toast.error(friendlyError(cause, "That move was refused."));
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
      if (!myTurn || busy || !position || coachReview?.status === "review") return;
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
      setPath(next);
      if (done && nextTargets(moves, next).length === 0) void send(done);
    },
    [myTurn, busy, position, coachReview, turn, movable, path, targets, moves, send, setPath]
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

  const resolveCoachReview = useCallback(
    async (choice: "continue" | "undo") => {
      if (!wallet || !match || !coachReview || busy) return;
      setBusy(true);
      try {
        const next = await (choice === "continue"
          ? continueComputerCoachReview(match.id, wallet, coachReview.attemptId, match.ply)
          : undoComputerCoachReview(match.id, wallet, coachReview.attemptId, match.ply));
        setCoachReview(next.status === "review" ? next : null);
        if (next.matchState) apply(next.matchState);
        else refresh();
      } catch (cause) {
        toast.error(friendlyError(cause, "The coach could not resolve that move."));
      } finally {
        setBusy(false);
      }
    },
    [wallet, match, coachReview, busy, apply, refresh]
  );

  const askForHint = useCallback(async () => {
    if (!wallet || !match || busy) return;
    setBusy(true);
    try {
      if (match.computer?.coachEnabled) {
        const hint = await requestComputerCoachHint(
          match.id,
          wallet,
          match.ply,
          crypto.randomUUID()
        );
        setCoachHint(hint);
        setHintPath(hint.suggestedUci ? (parseUci(hint.suggestedUci, match.variant) ?? []) : []);
      } else {
        const hint = await requestComputerHint(match.id, wallet, crypto.randomUUID());
        setCoachHint({
          id: hint.id,
          matchId: hint.matchId,
          ply: hint.ply,
          level: 1,
          message: "Try the highlighted move.",
          motif: "best_move",
          suggestedUci: hint.suggestedUci,
          suggestedSan: null,
          actions: [],
          createdAt: hint.createdAt,
        });
        setHintPath(parseUci(hint.suggestedUci, match.variant) ?? []);
      }
    } catch (cause) {
      toast.error(friendlyError(cause, "A hint is not available right now."));
    } finally {
      setBusy(false);
    }
  }, [wallet, match, busy]);

  if (loading && !match) {
    return <p className="py-16 text-center text-[14px] text-white/50">Loading game…</p>;
  }
  if (error && !match) {
    return <p className="py-16 text-center text-[14px] text-red-400">{error}</p>;
  }
  if (!match || !board) return null;

  const orientation: DraughtsSide = seat ?? "white";
  const opponent = OTHER[orientation];
  const captured = capturedCounts(board, match.variant);
  const whiteName = match.white?.username ?? "Open seat";
  const blackName = match.black?.username ?? "Open seat";
  const nameOf = (side: DraughtsSide) => (side === "white" ? whiteName : blackName);
  const topClock = remainingSeconds(match, opponent, now);
  const bottomClock = remainingSeconds(match, orientation, now);
  const unlimited = match.clockMode === "unlimited";
  const settled = match.state === "settled" || match.state === "cancelled";
  const waiting = match.state === "awaiting_opponent";
  const canJoin = waiting && !seat && !!wallet;
  const drawOfferedToMe = !!seat && match.drawOffered === OTHER[seat];
  const mustCapture = myTurn && moves.some((move) => move.captured.length > 0);
  const canExtend =
    !!seat &&
    match.state === "in_progress" &&
    match.timeExtensions.allowed &&
    match.timeExtensions.used < match.timeExtensions.maxUses &&
    match.timeExtensions.totalSeconds + EXTENSION_SECONDS <= match.timeExtensions.maxTotalSeconds;
  const boardLastMove = hintPath.length ? hintPath : lastMove;

  const playerPanel = (
    <>
      <PlayerClock
        desktopOnly
        name={nameOf(opponent)}
        side={opponent}
        captured={captured[OTHER[opponent]]}
        rating={match.rating?.[opponent]}
        clock={topClock}
        unlimited={unlimited}
        active={match.state === "in_progress" && match.turn === opponent}
      />
      <div className={`${DRAUGHTS_PANEL_HEADER_CLASS} justify-between px-2`}>
        <div className="flex">
          <TabButton active={panelTab === "game"} onClick={() => setPanelTab("game")}>
            Game
          </TabButton>
          {!match.computer ? (
            <TabButton active={panelTab === "chat"} onClick={() => setPanelTab("chat")}>
              Chat
            </TabButton>
          ) : null}
          {!match.computer ? (
            <TabButton active={panelTab === "comments"} onClick={() => setPanelTab("comments")}>
              Comments
            </TabButton>
          ) : null}
          {spectating ? (
            <TabButton active={panelTab === "market"} onClick={() => setPanelTab("market")}>
              Market
            </TabButton>
          ) : null}
        </div>
        <span
          className={`mr-2 h-2 w-2 rounded-full ${live ? "bg-emerald-400" : "bg-white/20"}`}
          title={live ? "Live updates connected" : "Using repair polling"}
        />
      </div>

      {panelTab === "chat" ? (
        <MatchChat match={match} wallet={wallet} className="min-h-0 flex-1 p-4" />
      ) : panelTab === "comments" ? (
        <MatchComments match={match} wallet={wallet} className="min-h-0 flex-1 p-4" />
      ) : panelTab === "market" ? (
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <SpectatorBetting match={match} wallet={wallet} />
        </div>
      ) : (
        <>
          <DraughtsMoveTable moves={match.moves} />
          <Feedback
            match={match}
            seat={seat}
            myTurn={myTurn}
            spectating={spectating}
            mustCapture={mustCapture}
            review={coachReview}
            hint={coachHint}
            onContinue={() => void resolveCoachReview("continue")}
            onTryAgain={() => void resolveCoachReview("undo")}
            busy={busy}
          />
          <div className="grid grid-cols-2 bg-black/15">
            {canJoin ? (
              <button
                type="button"
                disabled={busy || shortForJoin}
                onClick={() =>
                  act(() => joinMatch(match.id, wallet as string), "Couldn't join that game.")
                }
                className={`${DRAUGHTS_PANEL_BUTTON_CLASS} col-span-2`}
              >
                {shortForJoin
                  ? `Need ${joinStake} USDC`
                  : joinStake
                    ? `Stake ${joinStake} USDC and join`
                    : "Join game"}
              </button>
            ) : null}
            {waiting && seat ? (
              <button
                type="button"
                onClick={async () => {
                  await copyText(
                    `${window.location.origin}/casino/checkers/play?match=${match.id}`
                  );
                  toast.success("Invite link copied.");
                }}
                className={DRAUGHTS_PANEL_BUTTON_CLASS}
              >
                Copy invite
              </button>
            ) : null}
            {waiting && seat ? (
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  act(() => abortMatch(match.id, wallet as string), "Couldn't cancel the game.")
                }
                className={DRAUGHTS_PANEL_BUTTON_CLASS}
              >
                Cancel
              </button>
            ) : null}
            {drawOfferedToMe ? (
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  act(
                    () => respondToDraw(match.id, wallet as string, true),
                    "Couldn't accept the draw."
                  )
                }
                className={DRAUGHTS_PANEL_BUTTON_CLASS}
              >
                Accept draw
              </button>
            ) : null}
            {drawOfferedToMe ? (
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  act(
                    () => respondToDraw(match.id, wallet as string, false),
                    "Couldn't decline the draw."
                  )
                }
                className={DRAUGHTS_PANEL_BUTTON_CLASS}
              >
                Decline draw
              </button>
            ) : null}
            {seat && match.state === "in_progress" && !drawOfferedToMe ? (
              <button
                type="button"
                disabled={busy || match.drawOffered === seat}
                onClick={() =>
                  act(() => offerDraw(match.id, wallet as string), "Couldn't offer a draw.")
                }
                className={DRAUGHTS_PANEL_BUTTON_CLASS}
              >
                {match.drawOffered === seat ? "Draw offered" : "Offer draw"}
              </button>
            ) : null}
            {seat && match.state === "in_progress" && match.takeback.takebackable ? (
              <button
                type="button"
                disabled={busy || match.takeback[seat]}
                onClick={() =>
                  act(
                    () => requestTakeback(match.id, wallet as string),
                    "Couldn't request a takeback."
                  )
                }
                className={DRAUGHTS_PANEL_BUTTON_CLASS}
              >
                {match.takeback[seat] ? "Takeback offered" : "Takeback"}
              </button>
            ) : null}
            {seat && match.state === "in_progress" && match.takeback[OTHER[seat]] ? (
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  act(
                    () => declineTakeback(match.id, wallet as string),
                    "Couldn't decline the takeback."
                  )
                }
                className={DRAUGHTS_PANEL_BUTTON_CLASS}
              >
                Decline takeback
              </button>
            ) : null}
            {match.computer && !match.computer.wager && seat && match.state === "in_progress" ? (
              <button
                type="button"
                disabled={busy || !myTurn || coachState?.awaitingResponse === true}
                onClick={() => void askForHint()}
                className={DRAUGHTS_PANEL_BUTTON_CLASS}
              >
                Hint{match.computer.hintsUsed ? ` · ${match.computer.hintsUsed} used` : ""}
              </button>
            ) : null}
            {canExtend ? (
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  act(
                    () =>
                      extendMatchTime(
                        match.id,
                        wallet as string,
                        EXTENSION_SECONDS,
                        crypto.randomUUID()
                      ),
                    "Couldn't add time."
                  )
                }
                className={DRAUGHTS_PANEL_BUTTON_CLASS}
              >
                +5 minutes to both
              </button>
            ) : null}
            {seat &&
            match.state === "in_progress" &&
            remainingSeconds(match, OTHER[seat], now) <= 0 ? (
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  act(() => claimTimeout(match.id, wallet as string), "Couldn't claim the timeout.")
                }
                className={DRAUGHTS_PANEL_BUTTON_CLASS}
              >
                Claim timeout
              </button>
            ) : null}
            {seat && match.state === "in_progress" ? (
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  act(() => resignMatch(match.id, wallet as string), "Couldn't resign.")
                }
                className={`${DRAUGHTS_PANEL_BUTTON_CLASS} text-red-300`}
              >
                Resign
              </button>
            ) : null}
            {seat && settled && !match.rematch.nextMatchId ? (
              <button
                type="button"
                disabled={busy || match.rematch.offeredBy === wallet}
                onClick={() =>
                  act(() => requestRematch(match.id, wallet as string), "Couldn't offer a rematch.")
                }
                className={DRAUGHTS_PANEL_BUTTON_CLASS}
              >
                {match.rematch.offeredBy === wallet ? "Rematch offered" : "Rematch"}
              </button>
            ) : null}
            {seat && settled && match.rematch.nextMatchId ? (
              <button
                type="button"
                onClick={() =>
                  router.push(`/casino/checkers/play?match=${match.rematch.nextMatchId as string}`)
                }
                className={DRAUGHTS_PANEL_BUTTON_CLASS}
              >
                Open rematch
              </button>
            ) : null}
            {settled ? (
              <button
                type="button"
                onClick={() => router.push(`/casino/checkers/review?match=${match.id}`)}
                className={DRAUGHTS_PANEL_BUTTON_CLASS}
              >
                Analyse game
              </button>
            ) : null}
          </div>
        </>
      )}

      <PlayerClock
        desktopOnly
        name={seat ? "You" : nameOf(orientation)}
        side={orientation}
        captured={captured[OTHER[orientation]]}
        rating={match.rating?.[orientation]}
        clock={bottomClock}
        unlimited={unlimited}
        active={match.state === "in_progress" && match.turn === orientation}
      />
    </>
  );

  return (
    <DraughtsWorkspace
      aside={
        <div className="space-y-4">
          <button
            type="button"
            onClick={() => router.push("/casino/checkers")}
            className="cursor-pointer text-[13px] text-white/45 transition-colors hover:text-white/80"
          >
            ← Checkers
          </button>
          <div className="border border-white/10 bg-white/[0.025] p-4 shadow-[0_10px_28px_rgba(0,0,0,0.18)]">
            <p className="text-[11px] font-semibold tracking-[0.08em] text-white/30 uppercase">
              {variantOption(match.variant).label}
            </p>
            <p className="mt-2 text-[18px] font-semibold text-white/85">
              {match.computer ? `Level ${match.computer.level} computer` : "Live draughts"}
            </p>
            <div className="mt-3 space-y-1.5 text-[12px] text-white/45">
              <p>{match.rating?.rated ? "Rated" : "Casual"}</p>
              <p>{unlimited ? "Unlimited time" : match.timeControl}</p>
              {match.wager ? <p>{match.wager.stakeUsdc} USDC each</p> : null}
              {match.computer?.wager ? <p>{match.computer.wager.stakeUsdc} USDC stake</p> : null}
              {match.timeExtensions.allowed ? (
                <p>
                  Time extensions {match.timeExtensions.used}/{match.timeExtensions.maxUses}
                </p>
              ) : null}
            </div>
          </div>
          {match.wager || match.computer?.wager ? <ChessCashierLauncher compact /> : null}
        </div>
      }
      board={
        <div className="min-w-0">
          <div className="mb-2 md:hidden">
            <PlayerClock
              compact
              name={nameOf(opponent)}
              side={opponent}
              captured={captured[OTHER[opponent]]}
              rating={match.rating?.[opponent]}
              clock={topClock}
              unlimited={unlimited}
              active={match.state === "in_progress" && match.turn === opponent}
            />
          </div>
          <DraughtsBoardView
            board={board}
            variant={match.variant}
            path={path}
            targets={targets}
            lastMove={boardLastMove}
            doomed={doomed}
            orientation={orientation}
            onFieldClick={
              myTurn && !busy && coachReview?.status !== "review" ? onFieldClick : undefined
            }
          />
          <div className="mt-2 md:hidden">
            <PlayerClock
              compact
              name={seat ? "You" : nameOf(orientation)}
              side={orientation}
              captured={captured[OTHER[orientation]]}
              rating={match.rating?.[orientation]}
              clock={bottomClock}
              unlimited={unlimited}
              active={match.state === "in_progress" && match.turn === orientation}
            />
          </div>
        </div>
      }
      panel={<div className="flex h-full min-h-0 flex-col">{playerPanel}</div>}
      controls={
        <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2 pr-[2.6%] text-[12px] text-white/38">
          <button
            type="button"
            onClick={async () => {
              try {
                downloadText(`checkers-${match.id.slice(0, 8)}.pdn`, await fetchPdn(match.id));
              } catch (cause) {
                toast.error(friendlyError(cause, "Couldn't export this game."));
              }
            }}
            className="cursor-pointer hover:text-white/75"
          >
            Download PDN
          </button>
          <button
            type="button"
            onClick={() => router.push("/casino/checkers/learn")}
            className="cursor-pointer hover:text-white/75"
          >
            Learn draughts
          </button>
        </div>
      }
    />
  );
}
