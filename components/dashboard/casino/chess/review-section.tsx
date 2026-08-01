"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { ChessBoard } from "@/components/dashboard/casino/chess/chess-board";
import { BoardThemePicker } from "@/components/dashboard/casino/chess/board-theme-picker";
import {
  CasinoEmpty,
  CasinoError,
  CasinoLoading,
} from "@/components/dashboard/casino/casino-state";
import { fetchMatch, fetchMatchMoves, fetchPgn } from "@/lib/casino/api/chess";
import { useBoardTheme } from "@/lib/casino/chess/board-theme";
import { identifyOpening } from "@/lib/casino/chess/openings";
import { fromUci, isInCheck, kingPos, parseFen, type Move } from "@/lib/casino/chess/engine";
import { useCasinoWallet } from "@/hooks/use-casino-wallet";
import { toast } from "@/lib/toast";
import type { ChessMatch } from "@/lib/casino/api/types";

// The position before any move is played. The replay walks from here through
// each move's fenAfter, so the whole board history comes from the moves endpoint
// with no client-side chess logic.
const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

// Chess-universal score, so the result reads the same in every language.
function resultScore(match: ChessMatch): string {
  if (!match.result) return "*";
  if (match.result.kind === "draw") return "½–½";
  return match.result.winner === "w" ? "1–0" : "0–1";
}

// Step through a finished (or in-progress) game move by move on the board. Read
// only: it never writes, so it works for a spectator or either player.
export function ReviewSection({ matchId }: { matchId: string | null }) {
  const t = useTranslations("casino.chess.common");
  const wallet = useCasinoWallet();
  const theme = useBoardTheme();

  const matchQuery = useQuery({
    queryKey: ["casino", "chess", "match", matchId ?? "none"],
    queryFn: () => fetchMatch(matchId as string),
    enabled: !!matchId,
  });
  const movesQuery = useQuery({
    queryKey: ["casino", "chess", "review-moves", matchId ?? "none"],
    queryFn: () => fetchMatchMoves(matchId as string),
    enabled: !!matchId,
  });

  const moves = useMemo(() => movesQuery.data ?? [], [movesQuery.data]);
  // positions[0] is the start; positions[i] is the board after ply i.
  const positions = useMemo(() => [START_FEN, ...moves.map((m) => m.fenAfter)], [moves]);

  const [ply, setPly] = useState(0);
  const last = positions.length - 1;
  // Jump to the latest position whenever the move count changes (the game's moves
  // load, or a new move arrives); between those the viewer stays wherever the
  // user navigated. Adjusting state during render — guarded by the previous
  // value — is React's pattern for this and avoids the cascading re-render an
  // effect would cause.
  const [seenLast, setSeenLast] = useState(last);
  if (seenLast !== last) {
    setSeenLast(last);
    setPly(last);
  }

  const current = Math.min(Math.max(ply, 0), last);
  const go = (target: number) => setPly(Math.min(Math.max(target, 0), last));

  // Left/right arrows step through the game; ignored while typing elsewhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") setPly((p) => Math.max(p - 1, 0));
      else if (e.key === "ArrowRight") setPly((p) => Math.min(p + 1, last));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [last]);

  const board = useMemo(() => {
    try {
      return parseFen(positions[current] ?? START_FEN).board;
    } catch {
      return null;
    }
  }, [positions, current]);

  const lastMove: Move | null = current > 0 ? fromUci(moves[current - 1].uci) : null;

  // The opening named by the moves up to the position on screen, so the label
  // grows as the viewer steps into the game the way it does on a live board.
  const opening = useMemo(
    () => identifyOpening(moves.slice(0, current).map((m) => m.san)),
    [moves, current]
  );

  if (!matchId) {
    return (
      <div className="mx-auto w-full max-w-[560px] px-4 pt-10 pb-20">
        <CasinoEmpty>{t("historyEmpty")}</CasinoEmpty>
      </div>
    );
  }
  if (matchQuery.error) {
    return (
      <div className="mx-auto w-full max-w-[560px] px-4 pt-10 pb-20">
        <CasinoError error={matchQuery.error} subject={t("historyTitle")} />
      </div>
    );
  }
  if (matchQuery.isLoading || !matchQuery.data || !board) {
    return (
      <div className="mx-auto w-full max-w-[560px] px-4 pt-10 pb-20">
        <CasinoLoading rows={5} />
      </div>
    );
  }

  const match = matchQuery.data;
  const orientation =
    match.black?.walletAddress?.toLowerCase() === wallet.address?.toLowerCase() ? "b" : "w";

  const navButton =
    "flex h-9 w-9 items-center justify-center rounded-lg border border-white/12 text-[15px] text-white/70 transition-colors hover:border-white/30 hover:text-white disabled:cursor-not-allowed disabled:opacity-35";

  return (
    <div className="mx-auto w-full max-w-[560px] px-4 pt-7 pb-20 sm:px-6">
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5 text-[13.5px]">
          <span className="truncate">
            {match.white?.username ?? t("waiting")} — {match.black?.username ?? t("waiting")}
          </span>
        </div>
        <div className="tnum shrink-0 rounded-lg bg-white/6 px-3 py-1 text-[15px] font-semibold">
          {resultScore(match)}
        </div>
      </div>

      <div className="mb-2.5 flex items-center justify-between gap-3">
        <span className="min-w-0 truncate text-[12px] text-white/55">
          {opening ? (
            <>
              <span className="tnum mr-1.5 text-white/40">{opening.eco}</span>
              {opening.name}
            </>
          ) : null}
        </span>
        <BoardThemePicker className="shrink-0" />
      </div>

      <ChessBoard
        board={board}
        orientation={orientation}
        lastMove={lastMove}
        checkSquare={
          isInCheck(board, current % 2 === 0 ? "w" : "b")
            ? kingPos(board, current % 2 === 0 ? "w" : "b")
            : null
        }
        theme={theme}
      />

      <div className="mt-3 flex items-center justify-center gap-2">
        <button
          className={navButton}
          onClick={() => go(0)}
          disabled={current === 0}
          aria-label="Start"
        >
          «
        </button>
        <button
          className={navButton}
          onClick={() => go(current - 1)}
          disabled={current === 0}
          aria-label="Previous move"
        >
          ‹
        </button>
        <div className="tnum min-w-[68px] text-center text-[12.5px] text-white/55">
          {current} / {last}
        </div>
        <button
          className={navButton}
          onClick={() => go(current + 1)}
          disabled={current === last}
          aria-label="Next move"
        >
          ›
        </button>
        <button
          className={navButton}
          onClick={() => go(last)}
          disabled={current === last}
          aria-label="End"
        >
          »
        </button>
      </div>

      {moves.length > 0 ? (
        <div className="ws-inset mt-4 max-h-[168px] overflow-y-auto rounded-[10px] px-3 py-2.5 text-[13px] leading-relaxed">
          {moves.map((m, i) => {
            const isActive = current === i + 1;
            return (
              <span key={m.ply}>
                {i % 2 === 0 ? <span className="text-white/35">{`${i / 2 + 1}. `}</span> : null}
                <button
                  onClick={() => go(i + 1)}
                  className={`tnum mr-1.5 cursor-pointer rounded px-1 transition-colors ${
                    isActive ? "bg-accent text-ink font-semibold" : "text-white/80 hover:bg-white/8"
                  }`}
                >
                  {m.san}
                </button>
              </span>
            );
          })}
        </div>
      ) : null}

      <div className="mt-4 flex items-center justify-between gap-3">
        <Link
          href="/casino/chess/history"
          className="rounded-full border border-white/15 px-3.5 py-1.5 font-sans text-[12px] font-semibold text-white/70 transition-colors hover:border-white/35 hover:text-white"
        >
          {t("historyTitle")}
        </Link>
        <button
          onClick={() => {
            void fetchPgn(match.id)
              .then((pgn) => {
                const url = URL.createObjectURL(
                  new Blob([pgn], { type: "application/x-chess-pgn" })
                );
                const a = document.createElement("a");
                a.href = url;
                a.download = `chess-${match.id}.pgn`;
                a.click();
                URL.revokeObjectURL(url);
              })
              .catch(() => toast.error(t("pgnFailed")));
          }}
          className="rounded-full border border-white/15 px-3.5 py-1.5 font-sans text-[12px] font-semibold text-white/70 transition-colors hover:border-white/35 hover:text-white"
        >
          {t("downloadPgn")}
        </button>
      </div>
    </div>
  );
}
