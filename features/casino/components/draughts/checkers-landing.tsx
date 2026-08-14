"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeftIcon } from "@/components/ui/icons";
import { CheckersComputerDialog } from "@/features/casino/components/draughts/checkers-computer-dialog";
import { CheckersLiveNowDialog } from "@/features/casino/components/draughts/checkers-live-now-dialog";
import { useDraughtsLiveMatches } from "@/features/casino/hooks/use-draughts-match";
import {
  DraughtsMoveTable,
  DraughtsReplayControls,
} from "@/features/casino/components/draughts/draughts-move-table";
import { DraughtsTrainingBoard } from "@/features/casino/components/draughts/draughts-training-board";
import {
  applyMove,
  exportFen,
  legalMoves,
  moveToSan,
  moveToUci,
  parseFen,
  parseUci,
  STARTING_FEN,
  type DraughtsMove,
} from "@/features/casino/lib/draughts/engine";
import { DRAUGHTS_HOME_PUZZLE_LINE } from "@/features/casino/lib/draughts/home-puzzle";
import styles from "@/features/casino/components/draughts/checkers-landing.module.css";

interface PuzzlePosition {
  fen: string;
  move: string | null;
  path: readonly number[];
}

type PuzzleStatus = "playing" | "good" | "fail" | "complete";

const INITIAL_POSITION: PuzzlePosition = {
  fen: STARTING_FEN,
  move: null,
  path: [],
};

export function CheckersLanding() {
  const router = useRouter();
  const params = useSearchParams();
  const liveOpen = params.get("live") === "1";
  const live = useDraughtsLiveMatches(liveOpen);
  const [timeline, setTimeline] = useState<PuzzlePosition[]>([INITIAL_POSITION]);
  const [activePly, setActivePly] = useState(0);
  const [step, setStep] = useState(0);
  const [status, setStatus] = useState<PuzzleStatus>("playing");
  const [solutionVisible, setSolutionVisible] = useState(false);

  const current = timeline[activePly] ?? INITIAL_POSITION;
  const position = useMemo(() => parseFen(current.fen, "standard"), [current.fen]);
  const atLatestPosition = activePly === timeline.length - 1;
  const expectedMove = DRAUGHTS_HOME_PUZZLE_LINE[step]?.player ?? null;
  const moves = useMemo(
    () => timeline.slice(1).flatMap((entry) => (entry.move ? [entry.move] : [])),
    [timeline]
  );
  const marks = useMemo<Record<number, { symbol: string; tone: "good" }>>(() => {
    const result: Record<number, { symbol: string; tone: "good" }> = {};
    for (let ply = 1; ply <= moves.length; ply += 2) {
      result[ply] = { symbol: "✓", tone: "good" };
    }
    return result;
  }, [moves.length]);
  const hintPath = useMemo(
    () => (solutionVisible && expectedMove ? (parseUci(expectedMove) ?? []) : []),
    [expectedMove, solutionVisible]
  );

  const playMove = (move: DraughtsMove) => {
    if (!atLatestPosition || !expectedMove || status === "complete") return;
    if (moveToUci(move) !== expectedMove) {
      setStatus("fail");
      setSolutionVisible(false);
      return;
    }

    let nextPosition = applyMove(position, move);
    const nextTimeline: PuzzlePosition[] = [
      ...timeline,
      {
        fen: exportFen(nextPosition),
        move: moveToSan(move),
        path: [...move.path],
      },
    ];

    const replyUci = DRAUGHTS_HOME_PUZZLE_LINE[step]?.reply;
    const reply = replyUci
      ? legalMoves(nextPosition).find((candidate) => moveToUci(candidate) === replyUci)
      : null;
    if (replyUci && !reply) {
      setStatus("fail");
      return;
    }
    if (reply) {
      nextPosition = applyMove(nextPosition, reply);
      nextTimeline.push({
        fen: exportFen(nextPosition),
        move: moveToSan(reply),
        path: [...reply.path],
      });
    }

    const nextStep = step + 1;
    setTimeline(nextTimeline);
    setActivePly(nextTimeline.length - 1);
    setStep(nextStep);
    setStatus(nextStep === DRAUGHTS_HOME_PUZZLE_LINE.length ? "complete" : "good");
    setSolutionVisible(false);
  };

  const reset = () => {
    setTimeline([INITIAL_POSITION]);
    setActivePly(0);
    setStep(0);
    setStatus("playing");
    setSolutionVisible(false);
  };

  const reviewing = !atLatestPosition;
  const title = reviewing
    ? `Reviewing move ${activePly}`
    : status === "complete"
      ? "Puzzle complete"
      : status === "fail"
        ? "Try again"
        : status === "good"
          ? "Good move"
          : "Your turn";
  const instruction = reviewing
    ? "Return to the last position to continue the puzzle."
    : status === "complete"
      ? "You found the complete forcing line."
      : status === "fail"
        ? "That move is legal, but it misses the strongest continuation."
        : step === 0
          ? "Find the best move for white."
          : "Black replied. Find white's next move.";

  return (
    <>
      <main className={styles.page}>
        <div className={styles.topline}>
          <Link href="/casino" className={styles.back}>
            <ChevronLeftIcon size={14} />
            Back
          </Link>
          <span>International draughts</span>
        </div>

        <div className={styles.stage}>
          <aside className={styles.puzzleSide}>
            <div className={styles.puzzleType}>♛ Standard puzzles</div>
            <section className={styles.puzzleCard}>
              <span className={styles.targetIcon} aria-hidden>
                ◎
              </span>
              <div>
                <strong>Coach puzzle</strong>
                <p>Rating: hidden</p>
                <p>
                  Step <b>{Math.min(step + 1, DRAUGHTS_HOME_PUZZLE_LINE.length)}</b> of{" "}
                  {DRAUGHTS_HOME_PUZZLE_LINE.length}
                </p>
              </div>
            </section>
            <Link href="/casino/checkers/learn" className={styles.fullCoachLink}>
              Open full lessons
            </Link>
          </aside>

          <section className={styles.board} aria-label="Interactive draughts coach puzzle">
            <DraughtsTrainingBoard
              fen={current.fen}
              variant="standard"
              orientation="white"
              enabled={atLatestPosition && status !== "complete"}
              lastMove={current.path}
              hintPath={hintPath}
              onMove={playMove}
            />
          </section>

          <aside className={styles.panel}>
            <header className={styles.panelHeader}>
              <div>
                <span>Coach puzzle</span>
                <strong>Moves</strong>
              </div>
              <button type="button" onClick={reset} disabled={timeline.length === 1}>
                Reset
              </button>
            </header>

            <DraughtsMoveTable
              moves={moves}
              activePly={activePly}
              marks={marks}
              onSelect={setActivePly}
            />

            <section className={styles.feedback} data-state={status} aria-live="polite">
              <Image
                src="/draughts/pieces/wK.svg"
                alt=""
                width={78}
                height={78}
                unoptimized
                aria-hidden
              />
              <div>
                <strong>{title}</strong>
                <p>{instruction}</p>
              </div>
              {!reviewing && status !== "complete" ? (
                <button type="button" onClick={() => setSolutionVisible(true)}>
                  {solutionVisible ? "Solution shown" : "View solution"}
                </button>
              ) : null}
              {status === "complete" ? (
                <button type="button" onClick={reset}>
                  Solve again
                </button>
              ) : null}
            </section>

            <DraughtsReplayControls
              activePly={activePly}
              totalPlies={moves.length}
              onSelect={setActivePly}
            />
          </aside>
        </div>
      </main>

      <CheckersComputerDialog
        open={params.get("computer") === "1"}
        onClose={() => router.replace("/casino/checkers", { scroll: false })}
      />
      <CheckersLiveNowDialog
        open={liveOpen}
        onClose={() => router.replace("/casino/checkers", { scroll: false })}
        matches={live.matches}
      />
    </>
  );
}
