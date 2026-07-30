"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
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

type Translator = ReturnType<typeof useTranslations>;

const DRAW_REASON_KEYS = {
  stalemate: "reasonStalemate",
  agreement: "reasonAgreement",
  repetition: "reasonRepetition",
  insufficient: "reasonInsufficient",
} as const;

function resultLine(t: Translator, match: ChessMatch, you: ChessColor | null): string {
  const r = match.result;
  if (!r) return match.state === "cancelled" ? t("resultAborted") : "";
  if (r.kind === "draw") return t("resultDraw", { reason: t(DRAW_REASON_KEYS[r.reason]) });
  const how =
    r.kind === "checkmate"
      ? t("howCheckmate")
      : r.kind === "resignation"
        ? t("howResignation")
        : t("howTimeout");
  if (you === null) {
    return r.winner === "w" ? t("resultWhiteWon", { how }) : t("resultBlackWon", { how });
  }
  return r.winner === you ? t("resultYouWon", { how }) : t("resultYouLost", { how });
}

const actionButton =
  "cursor-pointer rounded-full border border-white/15 px-3.5 py-1.5 font-sans text-[11.5px] font-semibold whitespace-nowrap text-white/70 transition-colors hover:border-white/35 hover:text-white disabled:opacity-50";

export function PlaySection({ matchId }: { matchId: string | null }) {
  const t = useTranslations("casino.chess.play");
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
        <CasinoEmpty>{t("noMatch")}</CasinoEmpty>
      </div>
    );
  }
  if (error) {
    return (
      <div className="mx-auto w-full max-w-[560px] px-4 pt-10 pb-20">
        <CasinoError error={error} subject={t("subject")} />
      </div>
    );
  }
  if (isLoading || !match || !position) {
    return (
      <div className="mx-auto w-full max-w-[560px] px-4 pt-10 pb-20">
        <CasinoLoading label={t("loading")} rows={5} />
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
        toast.error(friendlyError(e, t("toastMoveFailed")));
      }
      return;
    }
    const piece = board[r][c];
    setSelected(piece && piece.color === you ? { r, c } : null);
  };

  const onOfferDraw = async () => {
    try {
      await offerDraw();
      toast.success(t("toastDrawOffered"));
    } catch (e) {
      toast.error(friendlyError(e, t("toastDrawOfferFailed")));
    }
  };

  const onAnswerDraw = async (accept: boolean) => {
    try {
      await respondToDraw(accept);
      toast.success(accept ? t("toastDrawAgreed") : t("toastDrawDeclined"));
    } catch (e) {
      toast.error(friendlyError(e, t("toastDrawAnswerFailed")));
    }
  };

  const onResign = async () => {
    const id = toast.loading(t("toastResigning"));
    try {
      await resign();
      toast.success(t("toastResigned"), { id });
    } catch (e) {
      toast.error(friendlyError(e, t("toastResignFailed")), { id });
    }
  };

  const onAbort = async () => {
    const id = toast.loading(t("toastAborting"));
    try {
      await abort();
      toast.success(t("toastAborted"), { id });
      router.push("/casino/chess");
    } catch (e) {
      toast.error(friendlyError(e, t("toastAbortFailed")), { id });
    }
  };

  // Opening a rematch seats only this player, so it lands on a board that waits
  // for the opponent to accept.
  const onRematch = async () => {
    const id = toast.loading(t("toastRematchOpening"));
    try {
      const next = await rematch();
      toast.success(t("toastRematchOpened"), { id });
      router.push(`/casino/chess/play?match=${next.id}`);
    } catch (e) {
      toast.error(friendlyError(e, t("toastRematchFailed")), { id });
    }
  };

  const onAcceptRematch = async () => {
    if (!rematchOffered) return;
    const id = toast.loading(t("toastRematchJoining"));
    try {
      const next = await acceptRematch.mutateAsync(rematchOffered);
      toast.success(t("toastRematchOn"), { id });
      router.push(`/casino/chess/play?match=${next.id}`);
    } catch (e) {
      toast.error(friendlyError(e, t("toastRematchJoinFailed")), { id });
    }
  };

  const opponent = you === "w" ? match.black : match.white;
  const self = you === "w" ? match.white : match.black;
  const opponentColor: ChessColor = you === "w" ? "b" : "w";
  const selfColor: ChessColor = you ?? "w";

  const moveList =
    match.moves.length === 0
      ? t("noMoves")
      : match.moves
          .reduce<string[]>((acc, san, i) => {
            if (i % 2 === 0) acc.push(`${i / 2 + 1}. ${san}`);
            else acc[acc.length - 1] += ` ${san}`;
            return acc;
          }, [])
          .join("  ");

  const turnLabel = over
    ? resultLine(t, match, you)
    : claimingTimeout
      ? t("statusClaiming")
      : waiting
        ? t("statusWaiting")
        : yourTurn
          ? moving
            ? t("statusSending")
            : t("statusYourMove")
          : you === null
            ? t("statusSpectating")
            : offerToAnswer
              ? t("statusDrawToYou")
              : offerPending
                ? t("statusDrawSent")
                : t("statusOpponentThinking");

  return (
    <div className="relative mx-auto w-full max-w-[560px] px-4 pt-7 pb-20 sm:px-6">
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5 text-[13.5px]">
          <span className="h-[26px] w-[26px] shrink-0 rounded-full border border-white/10 bg-white/8" />
          <span className="truncate">{opponent ? opponent.username : t("waitingForOpponent")}</span>
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
          <span className="truncate">{self ? self.username : t("you")}</span>
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
              {aborting ? "…" : t("abort")}
            </button>
          ) : offerToAnswer ? (
            <>
              <button
                onClick={() => void onAnswerDraw(true)}
                disabled={respondingToDraw}
                className={actionButton}
              >
                {respondingToDraw ? "…" : t("acceptDraw")}
              </button>
              <button
                onClick={() => void onAnswerDraw(false)}
                disabled={respondingToDraw}
                className={actionButton}
              >
                {t("declineDraw")}
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => void onOfferDraw()}
                disabled={offeringDraw || offerPending}
                className={actionButton}
              >
                {offeringDraw ? "…" : offerPending ? t("drawOffered") : t("offerDraw")}
              </button>
              <button
                onClick={() => void onResign()}
                disabled={resigning}
                className="border-down/40 text-down cursor-pointer rounded-full border px-3.5 py-1.5 font-sans text-[11.5px] font-semibold whitespace-nowrap disabled:opacity-50"
              >
                {resigning ? "…" : t("resign")}
              </button>
            </>
          )
        ) : null}
      </div>

      {over ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-[10px] bg-black/60 backdrop-blur-md">
          <div className="ws-glass w-[320px] rounded-2xl px-8 py-9 text-center shadow-[0_24px_60px_rgba(0,0,0,0.5)]">
            <div className="text-[12px] font-semibold tracking-[0.06em] text-white/70 uppercase">
              {resultLine(t, match, you)}
            </div>
            {you !== null ? (
              rematchOffered ? (
                <>
                  <div className="mt-4 text-[12.5px] font-normal text-white/70">
                    {t("opponentWantsRematch")}
                  </div>
                  <button
                    onClick={() => void onAcceptRematch()}
                    disabled={acceptRematch.isPending}
                    className="text-ink mt-2.5 w-full cursor-pointer rounded-full bg-white p-3 font-sans text-[13px] font-bold disabled:opacity-50"
                  >
                    {acceptRematch.isPending ? t("joining") : t("acceptRematch")}
                  </button>
                </>
              ) : (
                <button
                  onClick={() => void onRematch()}
                  disabled={requestingRematch}
                  className="text-ink mt-5 w-full cursor-pointer rounded-full bg-white p-3 font-sans text-[13px] font-bold disabled:opacity-50"
                >
                  {requestingRematch ? t("opening") : t("rematch")}
                </button>
              )
            ) : null}
            <button
              onClick={() => router.push("/casino/chess")}
              className="mt-2.5 w-full cursor-pointer rounded-full border border-white/15 p-3 font-sans text-[13px] font-semibold text-white/70 transition-colors hover:border-white/35 hover:text-white"
            >
              {t("backToLobby")}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
