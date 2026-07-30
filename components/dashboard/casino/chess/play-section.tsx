"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAcceptChallenge, useChessMatch, useRematchOffer } from "@/hooks/use-casino-chess";
import { ChessBoard } from "@/components/dashboard/casino/chess/chess-board";
import {
  CasinoEmpty,
  CasinoError,
  CasinoLoading,
} from "@/components/dashboard/casino/casino-state";
import { legalMovesForPiece, parseFen, toUci, type Square } from "@/lib/casino/chess/engine";
import { friendlyError } from "@/lib/errors";
import { toast } from "@/lib/toast";
import type { ChessColor, ChessMatch } from "@/lib/casino/api/types";

function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function resultLine(match: ChessMatch, you: ChessColor | null): string {
  const r = match.result;
  if (!r) return match.state === "cancelled" ? "Game aborted" : "";
  if (r.kind === "draw") return `Draw · ${r.reason}`;
  const how =
    r.kind === "checkmate" ? "Checkmate" : r.kind === "resignation" ? "Resignation" : "Flag fall";
  if (you === null) return `${how} · ${r.winner === "w" ? "White" : "Black"} won`;
  return `${how} · You ${r.winner === you ? "won" : "lost"}`;
}

const actionButton =
  "cursor-pointer rounded-full border border-white/15 px-3.5 py-1.5 font-sans text-[11.5px] font-semibold whitespace-nowrap text-white/70 transition-colors hover:border-white/35 hover:text-white disabled:opacity-50";

export function PlaySection({ matchId }: { matchId: string | null }) {
  const router = useRouter();
  const {
    match,
    clocks,
    you,
    isLoading,
    error,
    submitMove,
    moving,
    resign,
    resigning,
    offerDraw,
    offeringDraw,
    respondToDraw,
    respondingToDraw,
    abort,
    aborting,
    rematch,
    requestingRematch,
    claimingTimeout,
  } = useChessMatch(matchId);
  const [selected, setSelected] = useState<Square | null>(null);
  // A rematch the opponent has already opened, which this player joins rather
  // than opening a second one of their own.
  const rematchOffered = useRematchOffer(match, you);
  const acceptRematch = useAcceptChallenge();

  // The board is whatever the server says. A malformed FEN yields null rather
  // than a silently half-rendered position.
  const position = useMemo(() => {
    if (!match) return null;
    try {
      return parseFen(match.fen);
    } catch {
      return null;
    }
  }, [match]);

  const yourTurn = !!match && match.state === "in_progress" && you !== null && match.turn === you;

  // Highlights are computed locally only so the board feels responsive. The
  // server revalidates every move, so a wrong hint can never become a wrong
  // result.
  const legalTargets = useMemo(() => {
    if (!position || !selected || !yourTurn) return [];
    return legalMovesForPiece(position.board, selected.r, selected.c);
  }, [position, selected, yourTurn]);

  if (!matchId) {
    return (
      <div className="mx-auto w-full max-w-[560px] px-4 pt-10 pb-20">
        <CasinoEmpty>No game selected. Pick one from the lobby to start playing.</CasinoEmpty>
      </div>
    );
  }
  if (error) {
    return (
      <div className="mx-auto w-full max-w-[560px] px-4 pt-10 pb-20">
        <CasinoError error={error} subject="this game" />
      </div>
    );
  }
  if (isLoading || !match || !position) {
    return (
      <div className="mx-auto w-full max-w-[560px] px-4 pt-10 pb-20">
        <CasinoLoading label="Loading the game" rows={5} />
      </div>
    );
  }

  const board = position.board;
  const over = match.state === "settled" || match.state === "cancelled";
  const waiting = match.state === "awaiting_opponent";
  // An offer from the other side is the one this player can answer.
  const offerToAnswer = you !== null && match.drawOffered !== null && match.drawOffered !== you;
  const offerPending = you !== null && match.drawOffered === you;

  const onSquareClick = async (r: number, c: number) => {
    if (!yourTurn || moving) return;
    if (selected && legalTargets.some((t) => t.r === r && t.c === c)) {
      const uci = toUci(board, selected, { r, c });
      setSelected(null);
      try {
        await submitMove(uci);
      } catch (e) {
        toast.error(friendlyError(e, "That move didn't go through."));
      }
      return;
    }
    const piece = board[r][c];
    setSelected(piece && piece.color === you ? { r, c } : null);
  };

  const onOfferDraw = async () => {
    try {
      await offerDraw();
      toast.success("Draw offered.");
    } catch (e) {
      toast.error(friendlyError(e, "Couldn't offer a draw."));
    }
  };

  const onAnswerDraw = async (accept: boolean) => {
    try {
      await respondToDraw(accept);
      toast.success(accept ? "Draw agreed." : "Draw declined.");
    } catch (e) {
      toast.error(friendlyError(e, "Couldn't answer that draw offer."));
    }
  };

  const onResign = async () => {
    const id = toast.loading("Resigning…");
    try {
      await resign();
      toast.success("Game resigned.", { id });
    } catch (e) {
      toast.error(friendlyError(e, "Couldn't resign."), { id });
    }
  };

  const onAbort = async () => {
    const id = toast.loading("Aborting…");
    try {
      await abort();
      toast.success("Game aborted.", { id });
      router.push("/casino/chess");
    } catch (e) {
      toast.error(friendlyError(e, "Couldn't abort that game."), { id });
    }
  };

  // Opening a rematch seats only this player, so it lands on a board that waits
  // for the opponent to accept.
  const onRematch = async () => {
    const id = toast.loading("Opening a rematch…");
    try {
      const next = await rematch();
      toast.success("Rematch opened, colours swapped. Waiting for your opponent.", { id });
      router.push(`/casino/chess/play?match=${next.id}`);
    } catch (e) {
      toast.error(friendlyError(e, "Couldn't start a rematch."), { id });
    }
  };

  const onAcceptRematch = async () => {
    if (!rematchOffered) return;
    const id = toast.loading("Joining the rematch…");
    try {
      const next = await acceptRematch.mutateAsync(rematchOffered);
      toast.success("Rematch on. Good luck.", { id });
      router.push(`/casino/chess/play?match=${next.id}`);
    } catch (e) {
      toast.error(friendlyError(e, "Couldn't join that rematch."), { id });
    }
  };

  const opponent = you === "w" ? match.black : match.white;
  const self = you === "w" ? match.white : match.black;
  const opponentColor: ChessColor = you === "w" ? "b" : "w";
  const selfColor: ChessColor = you ?? "w";

  const moveList =
    match.moves.length === 0
      ? "No moves yet"
      : match.moves
          .reduce<string[]>((acc, san, i) => {
            if (i % 2 === 0) acc.push(`${i / 2 + 1}. ${san}`);
            else acc[acc.length - 1] += ` ${san}`;
            return acc;
          }, [])
          .join("  ");

  const turnLabel = over
    ? resultLine(match, you)
    : claimingTimeout
      ? "Clock ran out, ending the game…"
      : waiting
        ? "Waiting for an opponent"
        : yourTurn
          ? moving
            ? "Sending your move…"
            : "Your move"
          : you === null
            ? "Spectating"
            : offerToAnswer
              ? "Draw offered to you"
              : offerPending
                ? "Draw offer sent"
                : "Opponent thinking…";

  return (
    <div className="relative mx-auto w-full max-w-[560px] px-4 pt-7 pb-20 sm:px-6">
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5 text-[13.5px]">
          <span className="h-[26px] w-[26px] shrink-0 rounded-full border border-white/10 bg-white/8" />
          <span className="truncate">{opponent ? opponent.username : "Waiting for opponent"}</span>
        </div>
        <div className="tnum shrink-0 rounded-lg border border-transparent bg-white/4 px-3.5 py-1.5 text-[20px]">
          {formatClock(clocks?.[opponentColor] ?? 0)}
        </div>
      </div>

      <ChessBoard
        board={board}
        selected={selected}
        legalTargets={legalTargets}
        orientation={you ?? "w"}
        onSquareClick={you !== null && !over ? (r, c) => void onSquareClick(r, c) : undefined}
      />

      <div className="mt-2.5 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5 text-[13.5px]">
          <span className="border-accent h-[26px] w-[26px] shrink-0 rounded-full border bg-white/8" />
          <span className="truncate">{self ? self.username : "You"}</span>
        </div>
        <div
          className={`tnum shrink-0 rounded-lg border px-3.5 py-1.5 text-[20px] ${
            yourTurn ? "border-accent/50 bg-white/6" : "border-transparent bg-white/4"
          }`}
        >
          {formatClock(clocks?.[selfColor] ?? 0)}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="ws-inset min-w-0 flex-1 truncate rounded-[10px] px-3 py-2 text-left text-[12px] font-normal text-white/70 [direction:rtl]">
          <span className="tnum [direction:ltr] [unicode-bidi:bidi-override]">{moveList}</span>
        </div>
        <div className="text-[12px] whitespace-nowrap text-white/50">{turnLabel}</div>

        {you !== null && !over ? (
          waiting ? (
            <button onClick={() => void onAbort()} disabled={aborting} className={actionButton}>
              {aborting ? "…" : "Abort"}
            </button>
          ) : offerToAnswer ? (
            <>
              <button
                onClick={() => void onAnswerDraw(true)}
                disabled={respondingToDraw}
                className={actionButton}
              >
                {respondingToDraw ? "…" : "Accept draw"}
              </button>
              <button
                onClick={() => void onAnswerDraw(false)}
                disabled={respondingToDraw}
                className={actionButton}
              >
                Decline
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => void onOfferDraw()}
                disabled={offeringDraw || offerPending}
                className={actionButton}
              >
                {offeringDraw ? "…" : offerPending ? "Draw offered" : "Offer draw"}
              </button>
              <button
                onClick={() => void onResign()}
                disabled={resigning}
                className="border-down/40 text-down cursor-pointer rounded-full border px-3.5 py-1.5 font-sans text-[11.5px] font-semibold whitespace-nowrap disabled:opacity-50"
              >
                {resigning ? "…" : "Resign"}
              </button>
            </>
          )
        ) : null}
      </div>

      {over ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-[10px] bg-black/60 backdrop-blur-md">
          <div className="ws-glass w-[320px] rounded-2xl px-8 py-9 text-center shadow-[0_24px_60px_rgba(0,0,0,0.5)]">
            <div className="text-[12px] font-semibold tracking-[0.06em] text-white/70 uppercase">
              {resultLine(match, you)}
            </div>
            {you !== null ? (
              rematchOffered ? (
                <>
                  <div className="mt-4 text-[12.5px] font-normal text-white/70">
                    Your opponent wants a rematch.
                  </div>
                  <button
                    onClick={() => void onAcceptRematch()}
                    disabled={acceptRematch.isPending}
                    className="text-ink mt-2.5 w-full cursor-pointer rounded-full bg-white p-3 font-sans text-[13px] font-bold disabled:opacity-50"
                  >
                    {acceptRematch.isPending ? "Joining…" : "Accept rematch"}
                  </button>
                </>
              ) : (
                <button
                  onClick={() => void onRematch()}
                  disabled={requestingRematch}
                  className="text-ink mt-5 w-full cursor-pointer rounded-full bg-white p-3 font-sans text-[13px] font-bold disabled:opacity-50"
                >
                  {requestingRematch ? "Opening…" : "Rematch"}
                </button>
              )
            ) : null}
            <button
              onClick={() => router.push("/casino/chess")}
              className="mt-2.5 w-full cursor-pointer rounded-full border border-white/15 p-3 font-sans text-[13px] font-semibold text-white/70 transition-colors hover:border-white/35 hover:text-white"
            >
              Back to lobby
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
