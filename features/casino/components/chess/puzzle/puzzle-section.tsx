"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CasinoError, CasinoLoading } from "@/features/casino/components/casino-state";
import { ChessBoard } from "@/features/casino/components/chess/chess-board";
import { PuzzleSide } from "@/features/casino/components/chess/puzzle/puzzle-side";
import {
  PuzzleTools,
  type PuzzleMoveLine,
} from "@/features/casino/components/chess/puzzle/puzzle-tools";
import { useCasinoWallet } from "@/features/casino/hooks/use-casino-wallet";
import {
  attemptPuzzle,
  fetchNextPuzzle,
  fetchPuzzleCatalog,
} from "@/features/casino/lib/api/chess-puzzles";
import type { ChessPuzzleSpeechReference } from "@/features/casino/lib/api/types";
import { BOARD_THEMES } from "@/features/casino/lib/chess/board-theme";
import {
  applyUciToFen,
  fromUci,
  legalMovesForSquare,
  parseFen,
  toUci,
  type Move,
  type PieceColor,
  type PieceType,
  type Square,
} from "@/features/casino/lib/chess/engine";
import type { PuzzleFeedback } from "@/features/casino/lib/chess/puzzle";
import { friendlyError } from "@/lib/errors";

interface SessionRound {
  id: string;
  result: "win" | "fail";
}

interface PromotionChoice {
  from: Square;
  to: Square;
  moves: Move[];
}

const greenTheme = BOARD_THEMES.find((theme) => theme.id === "green") ?? BOARD_THEMES[0];

function sameSquare(left: Square, right: Square): boolean {
  return left.r === right.r && left.c === right.c;
}

function uniqueTargets(moves: Move[]): Square[] {
  return moves.reduce<Square[]>((targets, move) => {
    if (!targets.some((target) => sameSquare(target, move.to))) targets.push(move.to);
    return targets;
  }, []);
}

function SessionStrip({ rounds, currentId }: { rounds: SessionRound[]; currentId: string }) {
  if (!rounds.length) return <div className="h-8" />;
  return (
    <div className="mt-1 flex h-8 items-center gap-1 overflow-x-auto rounded-[5px] bg-[#171614] px-2">
      {rounds.map((round) => (
        <span
          key={round.id}
          title={`Puzzle ${round.id}`}
          className={`grid size-5 shrink-0 place-items-center rounded-[3px] text-[11px] font-bold text-white ${
            round.result === "win" ? "bg-[#638b3d]" : "bg-[#b13d31]"
          } ${round.id === currentId ? "ring-1 ring-white/60" : "opacity-72"}`}
        >
          {round.result === "win" ? "+" : "−"}
        </span>
      ))}
      {!rounds.some((round) => round.id === currentId) ? (
        <span className="h-5 w-1 rounded-full bg-white/45" aria-hidden />
      ) : null}
    </div>
  );
}

function PromotionPicker({
  color,
  choice,
  onChoose,
  onCancel,
}: {
  color: PieceColor;
  choice: PromotionChoice;
  onChoose: (piece: PieceType) => void;
  onCancel: () => void;
}) {
  const pieces = ["q", "r", "b", "n"] as const;
  const available = new Set(choice.moves.map((move) => move.promotion).filter(Boolean));
  return (
    <div className="absolute inset-0 z-30 grid place-items-center bg-black/55 backdrop-blur-[2px]">
      <div className="rounded-[8px] border border-white/12 bg-[#262522] p-3 shadow-2xl">
        <p className="mb-2 text-center text-[10px] font-bold tracking-[0.1em] text-white/42 uppercase">
          Promote to
        </p>
        <div className="flex gap-1.5">
          {pieces
            .filter((piece) => available.has(piece))
            .map((piece) => (
              <button
                key={piece}
                type="button"
                onClick={() => onChoose(piece)}
                className="grid size-14 place-items-center rounded-[5px] bg-white/[0.045] hover:bg-white/[0.1]"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/piece/neo/${color}${piece}.png`} alt={piece} className="size-12" />
              </button>
            ))}
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="mt-2 h-7 w-full text-[10px] font-semibold text-white/35 hover:text-white/65"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export function PuzzleSection() {
  const wallet = useCasinoWallet();
  const player = wallet.address;
  const [targetRating, setTargetRating] = useState(1200);
  const [theme, setTheme] = useState("");
  const [round, setRound] = useState(0);
  const [viewFen, setViewFen] = useState("");
  const [selected, setSelected] = useState<Square | null>(null);
  const [lastMove, setLastMove] = useState<Move | null>(null);
  const [solutionPly, setSolutionPly] = useState(0);
  const [feedback, setFeedback] = useState<PuzzleFeedback>("init");
  const [message, setMessage] = useState("Find the best move.");
  const [speech, setSpeech] = useState<ChessPuzzleSpeechReference | null>(null);
  const [hintUsed, setHintUsed] = useState(false);
  const [failedCurrent, setFailedCurrent] = useState(false);
  const [checking, setChecking] = useState(false);
  const [autoNext, setAutoNext] = useState(false);
  const [moves, setMoves] = useState<PuzzleMoveLine[]>([]);
  const [session, setSession] = useState<SessionRound[]>([]);
  const [promotion, setPromotion] = useState<PromotionChoice | null>(null);
  const [loadedPuzzleKey, setLoadedPuzzleKey] = useState<string | null>(null);
  const startedAt = useRef<{ puzzleKey: string | null; at: number }>({ puzzleKey: null, at: 0 });
  const replyTimer = useRef<number | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);

  const catalogQuery = useQuery({
    queryKey: ["casino", "chess", "puzzles", "catalog"],
    queryFn: fetchPuzzleCatalog,
    staleTime: 60 * 60 * 1000,
  });
  const puzzleQuery = useQuery({
    queryKey: ["casino", "chess", "puzzles", "next", player, targetRating, theme, round],
    queryFn: () => fetchNextPuzzle(player as string, targetRating, theme || undefined),
    enabled: !!player,
    retry: 1,
  });
  const puzzle = puzzleQuery.data;
  const puzzleKey = puzzle ? `${puzzle.id}:${round}` : null;
  const position = useMemo(() => (viewFen ? parseFen(viewFen) : null), [viewFen]);
  const orientation: PieceColor = puzzle?.sideToMove === "black" ? "b" : "w";
  const selectedMoves = useMemo(
    () => (position && selected ? legalMovesForSquare(position, selected.r, selected.c) : []),
    [position, selected]
  );
  const legalTargets = useMemo(() => uniqueTargets(selectedMoves), [selectedMoves]);

  if (puzzle && puzzleKey !== loadedPuzzleKey) {
    setLoadedPuzzleKey(puzzleKey);
    setViewFen(puzzle.fen);
    setSelected(null);
    setLastMove(fromUci(puzzle.lastMove));
    setSolutionPly(0);
    setFeedback("init");
    setMessage(puzzle.narration.introduction.text || "Find the best move.");
    setSpeech(puzzle.narration.introduction.speech);
    setHintUsed(false);
    setFailedCurrent(false);
    setChecking(false);
    setMoves([]);
    setPromotion(null);
  }

  useEffect(() => {
    if (!autoNext || feedback !== "complete") return;
    const timer = window.setTimeout(() => setRound((value) => value + 1), 1400);
    return () => window.clearTimeout(timer);
  }, [autoNext, feedback]);

  useEffect(
    () => () => {
      if (replyTimer.current !== null) window.clearTimeout(replyTimer.current);
      audio.current?.pause();
    },
    []
  );

  function restartPuzzle() {
    if (!puzzle || checking) return;
    if (replyTimer.current !== null) window.clearTimeout(replyTimer.current);
    setViewFen(puzzle.fen);
    setSelected(null);
    setLastMove(fromUci(puzzle.lastMove));
    setSolutionPly(0);
    setFeedback("init");
    setMessage(puzzle.narration.introduction.text || "Find the best move.");
    setSpeech(puzzle.narration.introduction.speech);
    setHintUsed(false);
    setFailedCurrent(false);
    setMoves([]);
    setPromotion(null);
    startedAt.current = { puzzleKey, at: 0 };
  }

  function nextPuzzle() {
    if (checking) return;
    setFeedback("init");
    setRound((value) => value + 1);
  }

  function showHint() {
    if (!puzzle || checking) return;
    if (startedAt.current.puzzleKey !== puzzleKey || !startedAt.current.at) {
      startedAt.current = { puzzleKey, at: Date.now() };
    }
    setHintUsed(true);
    setMessage(puzzle.narration.hint.text || "Look for forcing checks, captures, and threats.");
    setSpeech(puzzle.narration.hint.speech);
  }

  async function playSpeech() {
    if (!speech) return;
    audio.current?.pause();
    const nextAudio = new Audio(`/api/chess/puzzles/speech/${encodeURIComponent(speech.key)}`);
    audio.current = nextAudio;
    try {
      await nextAudio.play();
    } catch {
      setMessage("Audio could not play in this browser. The narration is shown as text.");
    }
  }

  async function submitMove(from: Square, to: Square, promotionPiece: PieceType = "q") {
    if (!puzzle || !player || !position || checking || feedback === "complete") return;
    const baseFen = viewFen;
    const baseLastMove = lastMove;
    const uci = toUci(position, from, to, promotionPiece);
    const optimistic = applyUciToFen(baseFen, uci);
    if (!optimistic) return;
    const attemptedAt = Date.now();
    if (startedAt.current.puzzleKey !== puzzleKey || !startedAt.current.at) {
      startedAt.current = { puzzleKey, at: attemptedAt };
    }

    setChecking(true);
    setSelected(null);
    setPromotion(null);
    setViewFen(optimistic.fen);
    setLastMove(fromUci(uci));

    try {
      const result = await attemptPuzzle(puzzle.id, {
        player,
        uci,
        solutionPly,
        idempotencyKey: crypto.randomUUID(),
        durationMs: Math.min(2_147_483_647, attemptedAt - startedAt.current.at),
        hintUsed,
      });

      setMoves((current) => [...current, { uci, correct: result.correct }]);
      setMessage(result.message);
      setSpeech(result.speech);

      if (!result.legal || !result.correct) {
        setFailedCurrent(true);
        setFeedback("fail");
        setViewFen(baseFen);
        setLastMove(baseLastMove);
        setChecking(false);
        return;
      }

      setSolutionPly(result.nextSolutionPly);
      if (result.completed) {
        setViewFen(result.nextFen);
        setFeedback("complete");
        setMessage(puzzle.narration.success.text || result.message);
        setSpeech(result.speech ?? puzzle.narration.success.speech);
        const sessionResult: SessionRound["result"] = failedCurrent ? "fail" : "win";
        setSession((current) =>
          [
            ...current.filter((item) => item.id !== puzzle.id),
            { id: puzzle.id, result: sessionResult },
          ].slice(-14)
        );
        setChecking(false);
        return;
      }

      setFeedback("good");
      if (!result.opponentMove) {
        setViewFen(result.nextFen);
        setChecking(false);
        return;
      }

      replyTimer.current = window.setTimeout(() => {
        setMoves((current) => [
          ...current,
          { uci: result.opponentMove as string, correct: true, opponent: true },
        ]);
        setViewFen(result.nextFen);
        setLastMove(fromUci(result.opponentMove as string));
        setChecking(false);
      }, 320);
    } catch (error) {
      setViewFen(baseFen);
      setLastMove(baseLastMove);
      setFeedback("fail");
      setMessage(friendlyError(error, "The puzzle service could not check that move."));
      setChecking(false);
    }
  }

  function tryMove(from: Square, to: Square) {
    if (!position || checking || feedback === "complete") return;
    const candidates = legalMovesForSquare(position, from.r, from.c).filter((move) =>
      sameSquare(move.to, to)
    );
    if (!candidates.length) return;
    if (candidates.filter((move) => move.promotion).length > 1) {
      setPromotion({ from, to, moves: candidates });
      return;
    }
    void submitMove(from, to, candidates[0]?.promotion);
  }

  function onSquareClick(r: number, c: number) {
    if (!position || checking || feedback === "complete") return;
    if (startedAt.current.puzzleKey !== puzzleKey || !startedAt.current.at) {
      startedAt.current = { puzzleKey, at: Date.now() };
    }
    const square = { r, c };
    if (selected && legalTargets.some((target) => sameSquare(target, square))) {
      tryMove(selected, square);
      return;
    }
    const piece = position.board[r][c];
    setSelected(piece?.color === position.turn ? square : null);
  }

  function changeTargetRating(rating: number) {
    setFeedback("init");
    setTargetRating(rating);
    setRound((value) => value + 1);
  }

  function changeTheme(nextTheme: string) {
    setFeedback("init");
    setTheme(nextTheme);
    setRound((value) => value + 1);
  }

  if (!player) {
    return (
      <main className="grid min-h-[calc(100svh-60px)] place-items-center bg-[#0b0b0a] px-5 text-center">
        <div>
          <h1 className="font-serif text-[30px] font-bold text-white">Sign in to solve puzzles</h1>
          <p className="mt-2 text-[13px] text-white/45">
            Your puzzle progress is saved to your account.
          </p>
        </div>
      </main>
    );
  }

  if (puzzleQuery.error) {
    return (
      <div className="min-h-[calc(100svh-60px)] bg-[#0b0b0a] px-4 py-10">
        <div className="mx-auto max-w-[900px]">
          <CasinoError
            error={puzzleQuery.error}
            subject="chess puzzles"
            onRetry={() => void puzzleQuery.refetch()}
          />
        </div>
      </div>
    );
  }

  if (puzzleQuery.isLoading || !puzzle || !position) {
    return (
      <div className="min-h-[calc(100svh-60px)] bg-[#0b0b0a] px-4 py-10">
        <div className="mx-auto max-w-[1100px]">
          <CasinoLoading label="Finding your next puzzle" rows={6} />
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-[calc(100svh-60px)] bg-[#0b0b0a] px-2 py-3 sm:px-4 lg:px-5">
      <div className="mx-auto grid w-full max-w-[1380px] grid-cols-1 gap-3 lg:grid-cols-[minmax(0,680px)_minmax(290px,380px)] xl:grid-cols-[250px_minmax(0,680px)_minmax(290px,380px)]">
        <PuzzleSide
          puzzle={puzzle}
          catalog={catalogQuery.data}
          targetRating={targetRating}
          theme={theme}
          autoNext={autoNext}
          disabled={checking}
          onTargetRating={changeTargetRating}
          onTheme={changeTheme}
          onAutoNext={setAutoNext}
        />

        <section className="order-1 min-w-0 xl:order-2">
          <div className="relative mx-auto w-full max-w-[680px]">
            <ChessBoard
              board={position.board}
              selected={selected}
              legalTargets={legalTargets}
              lastMove={lastMove}
              orientation={orientation}
              theme={greenTheme}
              onSquareClick={onSquareClick}
              onSquareDrop={tryMove}
            />
            {promotion ? (
              <PromotionPicker
                color={position.turn}
                choice={promotion}
                onChoose={(piece) => void submitMove(promotion.from, promotion.to, piece)}
                onCancel={() => setPromotion(null)}
              />
            ) : null}
          </div>
          <SessionStrip rounds={session} currentId={puzzle.id} />
          <div className="mt-1 flex items-center justify-between px-1 text-[10px] text-white/28">
            <span>{orientation === "w" ? "White" : "Black"} to move</span>
            <span className="tabular-nums">
              Move {Math.floor(solutionPly / 2) + 1} of {puzzle.playerMoveCount}
            </span>
          </div>
        </section>

        <PuzzleTools
          feedback={feedback}
          message={message}
          orientation={orientation}
          moves={moves}
          speech={speech}
          hintAvailable={!hintUsed}
          checking={checking}
          onHint={showHint}
          onListen={() => void playSpeech()}
          onRestart={restartPuzzle}
          onNext={nextPuzzle}
        />
      </div>
    </main>
  );
}
