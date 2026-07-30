"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useChessMatch } from "@/hooks/use-casino-chess";
import { useCasinoWallet } from "@/hooks/use-casino-wallet";
import { ChessBoard } from "@/components/dashboard/casino/chess/chess-board";
import {
  CasinoEmpty,
  CasinoError,
  CasinoLoading,
} from "@/components/dashboard/casino/casino-state";
import { legalMovesForPiece, parseFen, toUci, type Square } from "@/lib/casino/chess/engine";
import { amountUsd } from "@/lib/casino/money";
import { friendlyError } from "@/lib/errors";
import { toast } from "@/lib/toast";
import type { ChessColor, ChessMatch } from "@/lib/casino/api/types";

function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function resultLine(match: ChessMatch, you: ChessColor | null): string {
  const r = match.result;
  if (!r) return "";
  if (r.kind === "draw") return `Draw · ${r.reason}`;
  const how =
    r.kind === "checkmate" ? "Checkmate" : r.kind === "resignation" ? "Resignation" : "Flag fall";
  if (you === null) return `${how} · ${r.winner === "w" ? "White" : "Black"} won`;
  return `${how} · You ${r.winner === you ? "won" : "lost"}`;
}

export function PlaySection({ matchId }: { matchId: string | null }) {
  const wallet = useCasinoWallet();
  const router = useRouter();
  const {
    match,
    clocks,
    isLoading,
    error,
    submitMove,
    moving,
    resign,
    resigning,
    offerDraw,
    offeringDraw,
  } = useChessMatch(matchId);
  const [selected, setSelected] = useState<Square | null>(null);

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

  // Which side the signed-in player is, or null when they are only watching.
  const you: ChessColor | null = !match
    ? null
    : match.white?.walletAddress?.toLowerCase() === wallet.address?.toLowerCase()
      ? "w"
      : match.black?.walletAddress?.toLowerCase() === wallet.address?.toLowerCase()
        ? "b"
        : null;

  const yourTurn = !!match && match.state === "in_progress" && you !== null && match.turn === you;

  // Highlights are computed locally only so the board feels responsive. The
  // server revalidates every move, so a wrong hint can never become a wrong
  // result.
  const legalTargets = useMemo(() => {
    if (!position || !selected || !yourTurn) return [];
    return legalMovesForPiece(position.board, selected.r, selected.c);
  }, [position, selected, yourTurn]);

  // A drawn game starts its rematch straight away. Give players a moment to
  // read the result, then move them onto the new board.
  const rematchId = match?.rematchId ?? null;
  useEffect(() => {
    if (!rematchId) return;
    const id = setTimeout(() => router.push(`/casino/chess/play?match=${rematchId}`), 2500);
    return () => clearTimeout(id);
  }, [rematchId, router]);

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
  const settled = match.state === "settled";

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
      const next = await offerDraw();
      toast.success(
        next.result?.kind === "draw"
          ? "Draw agreed. Stakes returned, rematch starting."
          : "Draw offered."
      );
    } catch (e) {
      toast.error(friendlyError(e, "Couldn't offer a draw."));
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

  const turnLabel = settled
    ? resultLine(match, you)
    : match.state !== "in_progress"
      ? "Waiting for an opponent"
      : yourTurn
        ? moving
          ? "Sending your move…"
          : "Your move"
        : you === null
          ? "Spectating"
          : "Opponent thinking…";

  return (
    <div className="relative mx-auto w-full max-w-[560px] px-4 pt-7 pb-20 sm:px-6">
      <div className="ws-display tnum text-grey-100 mb-4 text-center text-[28px]">
        {wallet.format(amountUsd(match.pot, wallet.unitPriceUsd))} pot
      </div>

      <div className="mb-2.5 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5 text-[13.5px]">
          <span className="h-[26px] w-[26px] shrink-0 rounded-full border border-white/10 bg-white/8" />
          <span className="truncate">
            {opponent ? `${opponent.username} (${opponent.rating})` : "Waiting for opponent"}
          </span>
        </div>
        <div className="tnum shrink-0 rounded-lg border border-transparent bg-white/4 px-3.5 py-1.5 text-[20px]">
          {formatClock(clocks?.[opponentColor] ?? 0)}
        </div>
      </div>

      <ChessBoard
        board={board}
        selected={selected}
        legalTargets={legalTargets}
        onSquareClick={you !== null && !settled ? (r, c) => void onSquareClick(r, c) : undefined}
      />

      <div className="mt-2.5 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5 text-[13.5px]">
          <span className="border-accent h-[26px] w-[26px] shrink-0 rounded-full border bg-white/8" />
          <span className="truncate">{self ? `${self.username} (${self.rating})` : "You"}</span>
        </div>
        <div
          className={`tnum shrink-0 rounded-lg border px-3.5 py-1.5 text-[20px] ${
            yourTurn ? "border-accent/50 bg-white/6" : "border-transparent bg-white/4"
          }`}
        >
          {formatClock(clocks?.[selfColor] ?? 0)}
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="ws-inset min-w-0 flex-1 truncate rounded-[10px] px-3 py-2 text-left text-[12px] font-normal text-white/70 [direction:rtl]">
          <span className="tnum [direction:ltr] [unicode-bidi:bidi-override]">{moveList}</span>
        </div>
        <div className="text-[12px] whitespace-nowrap text-white/50">{turnLabel}</div>
        {you !== null && !settled ? (
          <>
            <button
              onClick={() => void onOfferDraw()}
              disabled={offeringDraw}
              className="cursor-pointer rounded-full border border-white/15 px-3.5 py-1.5 font-sans text-[11.5px] font-semibold whitespace-nowrap text-white/70 transition-colors hover:border-white/35 hover:text-white disabled:opacity-50"
            >
              {offeringDraw
                ? "…"
                : match.drawOffered && match.drawOffered !== you
                  ? "Accept draw"
                  : "Offer draw"}
            </button>
            <button
              onClick={() => void onResign()}
              disabled={resigning}
              className="border-down/40 text-down cursor-pointer rounded-full border px-3.5 py-1.5 font-sans text-[11.5px] font-semibold whitespace-nowrap disabled:opacity-50"
            >
              {resigning ? "…" : "Resign"}
            </button>
          </>
        ) : null}
      </div>

      {settled ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-[10px] bg-black/60 backdrop-blur-md">
          <div className="ws-glass w-[320px] rounded-2xl px-8 py-9 text-center shadow-[0_24px_60px_rgba(0,0,0,0.5)]">
            <div className="text-[12px] font-semibold tracking-[0.06em] text-white/70 uppercase">
              {resultLine(match, you)}
            </div>
            {match.result?.kind === "draw" ? (
              <>
                <div className="ws-display tnum text-grey-100 mt-2 text-[28px]">
                  {wallet.format(amountUsd(match.stake, wallet.unitPriceUsd))}
                </div>
                <div className="mt-1 text-[12px] font-normal text-white/50">
                  Your stake came back in full
                </div>
                {rematchId ? (
                  <div className="mt-5">
                    <div className="border-accent/30 border-t-accent mx-auto mb-3 h-7 w-7 animate-spin rounded-full border-2" />
                    <div className="text-[12.5px] font-normal text-white/70">
                      Rematch starting, colours swapped…
                    </div>
                  </div>
                ) : (
                  <div className="mt-5 text-[12.5px] font-normal text-white/50">
                    No rematch this time. Your stake is back in your balance.
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="ws-display tnum text-grey-100 mt-2 text-[34px]">
                  {wallet.format(amountUsd(match.pot, wallet.unitPriceUsd))}
                </div>
                <div className="mt-1 text-[12px] font-normal text-white/50">
                  Settled by the casino, paid to your balance
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
