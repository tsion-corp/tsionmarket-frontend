"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { CheckIcon, PlayIcon } from "@/components/ui/icons";
import { ChessBoard } from "@/features/casino/components/chess/chess-board";
import {
  PuzzleAwardPreview,
  PuzzlePathPreview,
} from "@/features/casino/components/chess/puzzle-path-preview";
import { BOARD_THEMES, DEFAULT_THEME } from "@/features/casino/lib/chess/board-theme";
import {
  parseVisemeTrack,
  visemeAt,
  type VisemeCue,
} from "@/features/casino/lib/chess/coach-audio";
import {
  applyUciToFen,
  legalMovesForSquare,
  parseFen,
  toUci,
  type Square,
} from "@/features/casino/lib/chess/engine";
import { PUZZLE_COACH_REFERENCES } from "@/features/casino/lib/chess/puzzle-coach-reference";
import {
  calculatePuzzlePathAward,
  CAPTURED_PUZZLE_PATH_START_XP,
  type PuzzlePathAward,
} from "@/features/casino/lib/chess/puzzle-path-reference";

const LAB_ASSET_BASE = "/api/labs/chess-puzzle-coach";
const PUZZLE_THEME = BOARD_THEMES.find((theme) => theme.id === "green") ?? DEFAULT_THEME;

const MOUTH_SHAPES: Record<number, { width: number; height: number; radius: number }> = {
  1: { width: 28, height: 7, radius: 50 },
  2: { width: 23, height: 13, radius: 48 },
  3: { width: 31, height: 10, radius: 42 },
  6: { width: 18, height: 17, radius: 50 },
  7: { width: 24, height: 19, radius: 45 },
  9: { width: 27, height: 4, radius: 50 },
};

type EngineState = "idle" | "loading" | "ready" | "error";
type LabPhase = "puzzle" | "award" | "path";

function squareIs(square: Square, r: number, c: number) {
  return square.r === r && square.c === c;
}

export function PuzzleCoachLab() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const workerTimeoutRef = useRef<number | null>(null);

  const [puzzleIndex, setPuzzleIndex] = useState(0);
  const [fen, setFen] = useState(PUZZLE_COACH_REFERENCES[0].fen);
  const [selected, setSelected] = useState<Square | null>(null);
  const [visemes, setVisemes] = useState<VisemeCue[]>([]);
  const [currentViseme, setCurrentViseme] = useState<number | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [muted, setMuted] = useState(false);
  const [started, setStarted] = useState(false);
  const [solved, setSolved] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [hintLevel, setHintLevel] = useState(0);
  const [feedback, setFeedback] = useState("Start the puzzle when you are ready.");
  const [labPhase, setLabPhase] = useState<LabPhase>("puzzle");
  const [pathXp, setPathXp] = useState(CAPTURED_PUZZLE_PATH_START_XP);
  const [previousPathXp, setPreviousPathXp] = useState(CAPTURED_PUZZLE_PATH_START_XP);
  const [collectedAward, setCollectedAward] = useState<PuzzlePathAward | null>(null);
  const [engineState, setEngineState] = useState<EngineState>("idle");
  const [engineMessage, setEngineMessage] = useState("Reference engine has not been loaded.");

  const puzzle = PUZZLE_COACH_REFERENCES[puzzleIndex];
  const position = parseFen(fen);
  const legalTargets = selected
    ? legalMovesForSquare(fen, selected.r, selected.c).map((move) => move.to)
    : [];
  const mouth = MOUTH_SHAPES[currentViseme ?? 9] ?? MOUTH_SHAPES[9];
  const puzzleAward = calculatePuzzlePathAward(puzzle.reward, attempts);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${LAB_ASSET_BASE}/visemes-${puzzle.id}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.text() : Promise.reject(Error("missing cues"))))
      .then((raw) => setVisemes(parseVisemeTrack(raw)))
      .catch(() => {
        if (!controller.signal.aborted) setVisemes([]);
      });
    return () => controller.abort();
  }, [puzzle.id]);

  useEffect(() => {
    if (!isSpeaking) return;

    const updateMouth = () => {
      const audio = audioRef.current;
      if (!audio || audio.paused || audio.ended) return;
      setCurrentViseme(visemeAt(visemes, audio.currentTime * 1000 + 33));
      animationFrameRef.current = window.requestAnimationFrame(updateMouth);
    };
    animationFrameRef.current = window.requestAnimationFrame(updateMouth);

    return () => {
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [isSpeaking, visemes]);

  useEffect(() => {
    return () => {
      workerRef.current?.terminate();
      if (workerTimeoutRef.current !== null) window.clearTimeout(workerTimeoutRef.current);
    };
  }, []);

  function playNarration() {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = 0;
    audio.muted = muted;
    setStarted(true);
    setIsSpeaking(true);
    setFeedback(puzzle.prompt);
    void audio.play().catch(() => {
      setIsSpeaking(false);
      setCurrentViseme(null);
      setFeedback("Audio was blocked. Select Replay coach to try again.");
    });
  }

  function toggleMuted() {
    const next = !muted;
    setMuted(next);
    if (audioRef.current) audioRef.current.muted = next;
  }

  function handleSquareClick(r: number, c: number) {
    if (!started || solved) return;

    const piece = position.board[r]?.[c];
    if (!selected) {
      if (piece?.color === position.turn) setSelected({ r, c });
      return;
    }

    if (squareIs(selected, r, c)) {
      setSelected(null);
      return;
    }

    const target = legalTargets.find((square) => squareIs(square, r, c));
    if (!target) {
      setSelected(piece?.color === position.turn ? { r, c } : null);
      return;
    }

    const uci = toUci(fen, selected, target);
    if (uci !== puzzle.solutionUci) {
      setAttempts((current) => current + 1);
      setSelected(null);
      setFeedback(puzzle.wrongMoveFeedback);
      return;
    }

    const next = applyUciToFen(fen, uci);
    if (!next) return;
    setFen(next.fen);
    setSelected(null);
    setSolved(true);
    setFeedback(puzzle.successFeedback);
  }

  function revealHint() {
    const next = Math.min(3, hintLevel + 1);
    setHintLevel(next);
    setFeedback(puzzle.hints[next - 1]);
    if (next === 3) {
      setSelected(puzzle.hintFrom);
    }
  }

  function resetPuzzle() {
    setFen(puzzle.fen);
    setSelected(null);
    setSolved(false);
    setAttempts(0);
    setHintLevel(0);
    setFeedback(puzzle.prompt);
  }

  function selectPuzzle(index: number) {
    const nextPuzzle = PUZZLE_COACH_REFERENCES[index];
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    setPuzzleIndex(index);
    setFen(nextPuzzle.fen);
    setSelected(null);
    setVisemes([]);
    setCurrentViseme(null);
    setIsSpeaking(false);
    setStarted(false);
    setSolved(false);
    setAttempts(0);
    setHintLevel(0);
    setCollectedAward(null);
    setFeedback("Start the puzzle when you are ready.");
  }

  function advancePuzzle() {
    selectPuzzle((puzzleIndex + 1) % PUZZLE_COACH_REFERENCES.length);
  }

  function showAward() {
    setCollectedAward(puzzleAward);
    setLabPhase("award");
  }

  function collectAward() {
    if (!collectedAward) return;
    setPreviousPathXp(pathXp);
    setPathXp(pathXp + collectedAward.total);
    setLabPhase("path");
  }

  function continueTraining() {
    advancePuzzle();
    setLabPhase("puzzle");
  }

  function resetCapturedPath() {
    setPreviousPathXp(CAPTURED_PUZZLE_PATH_START_XP);
    setPathXp(CAPTURED_PUZZLE_PATH_START_XP);
  }

  function startReferenceEngine() {
    if (workerRef.current || engineState === "loading") return;
    if (typeof Worker !== "function" || typeof WebAssembly !== "object") {
      setEngineState("error");
      setEngineMessage("This browser cannot run the reference WebAssembly worker.");
      return;
    }

    setEngineState("loading");
    setEngineMessage("Loading the 27 MB explanation worker...");
    const worker = new Worker(`${LAB_ASSET_BASE}/engine-js#${LAB_ASSET_BASE}/engine-wasm`);
    workerRef.current = worker;

    worker.onmessage = (event) => {
      const line = String(event.data ?? "");
      if (!line.includes("uciok")) return;
      if (workerTimeoutRef.current !== null) window.clearTimeout(workerTimeoutRef.current);
      setEngineState("ready");
      setEngineMessage("Reference explanation worker initialized and answered UCI.");
    };
    worker.onerror = () => {
      if (workerTimeoutRef.current !== null) window.clearTimeout(workerTimeoutRef.current);
      worker.terminate();
      workerRef.current = null;
      setEngineState("error");
      setEngineMessage("The reference worker failed to initialize. Check the local fixture route.");
    };
    workerTimeoutRef.current = window.setTimeout(() => {
      worker.terminate();
      workerRef.current = null;
      setEngineState("error");
      setEngineMessage("The reference worker did not become ready within 20 seconds.");
    }, 20_000);
    worker.postMessage("uci");
  }

  return (
    <section className="relative isolate min-h-[calc(100vh-80px)] overflow-hidden rounded-2xl border border-white/8 bg-[#11120f] text-[#f4f0e6] shadow-[0_30px_90px_rgba(0,0,0,.4)]">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_15%_8%,rgba(181,145,74,.18),transparent_30%),radial-gradient(circle_at_90%_86%,rgba(58,98,73,.18),transparent_35%),linear-gradient(145deg,#171813_0%,#0e0f0d_65%)]" />
      <div className="pointer-events-none absolute inset-0 -z-10 [background-image:linear-gradient(rgba(255,255,255,.8)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.8)_1px,transparent_1px)] [background-size:38px_38px] opacity-[.055]" />

      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-white/8 px-5 py-5 sm:px-8">
        <div>
          <div className="mb-2 flex items-center gap-2 text-[10px] font-bold tracking-[.2em] text-[#d7b66e] uppercase">
            <span className="h-1.5 w-1.5 rounded-full bg-[#d7b66e] shadow-[0_0_14px_#d7b66e]" />
            Development reference
          </div>
          <h1 className="font-serif text-3xl leading-none tracking-[-.03em] sm:text-4xl">
            {puzzle.title}
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-white/48">
            Captured puzzle {puzzleIndex + 1} of {PUZZLE_COACH_REFERENCES.length}, with its matching
            narration, lip-sync cues, hints, and board solution.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-white/10 bg-white/[.04] px-3 py-1.5 text-[10px] font-bold tracking-[.14em] text-white/55 uppercase">
            Puzzle {puzzleIndex + 1} / {PUZZLE_COACH_REFERENCES.length}
          </span>
          <span className="rounded-full border border-white/10 bg-white/[.04] px-3 py-1.5 text-[10px] font-bold tracking-[.14em] text-white/55 uppercase">
            {pathXp} XP
          </span>
          <span className="rounded-full border border-[#d7b66e]/30 bg-[#d7b66e]/8 px-3 py-1.5 text-[10px] font-bold tracking-[.14em] text-[#d7b66e] uppercase">
            Dev only
          </span>
        </div>
      </header>

      <div className="grid gap-6 p-4 sm:p-7 lg:grid-cols-[minmax(0,1fr)_370px] lg:gap-8">
        <div className="min-w-0">
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold tracking-[.15em] text-white/35 uppercase">
                White to move
              </p>
              <p className="mt-1 text-sm font-semibold text-white/78">Find the checkmate</p>
            </div>
            <p className="text-xs text-white/35 tabular-nums">
              {attempts} {attempts === 1 ? "retry" : "retries"}
            </p>
          </div>

          <div className="relative mx-auto max-w-[680px] rounded-xl border border-white/10 bg-black/30 p-2 shadow-[0_24px_70px_rgba(0,0,0,.38)] sm:p-3">
            <ChessBoard
              board={position.board}
              selected={selected}
              legalTargets={hintLevel >= 3 && selected ? [puzzle.hintTo] : legalTargets}
              orientation="w"
              theme={PUZZLE_THEME}
              onSquareClick={handleSquareClick}
            />

            {!started && (
              <div className="absolute inset-2 grid place-items-center rounded-lg bg-[#0b0d0a]/72 backdrop-blur-[3px] sm:inset-3">
                <button
                  type="button"
                  onClick={playNarration}
                  className="group grid h-28 w-28 cursor-pointer place-items-center rounded-full border border-[#d7b66e]/45 bg-[#18170f]/90 shadow-[0_0_0_12px_rgba(215,182,110,.05),0_16px_48px_rgba(0,0,0,.5)] transition-transform hover:scale-[1.03]"
                >
                  <span className="grid h-12 w-12 place-items-center rounded-full bg-[#d7b66e] text-[#1b160b] transition-transform group-hover:scale-105">
                    <PlayIcon size={18} />
                  </span>
                  <span className="-mt-4 text-[10px] font-bold tracking-[.13em] text-[#d7b66e] uppercase">
                    Start puzzle
                  </span>
                </button>
              </div>
            )}

            {solved && (
              <div className="pointer-events-none absolute inset-2 grid place-items-center rounded-lg bg-[#0b0d0a]/30 sm:inset-3">
                <div className="grid h-24 w-24 place-items-center rounded-full border border-[#80b88b]/40 bg-[#122117]/94 text-[#9bd0a5] shadow-[0_12px_44px_rgba(0,0,0,.45)]">
                  <CheckIcon size={36} />
                </div>
              </div>
            )}
          </div>
        </div>

        <aside className="flex min-h-[520px] flex-col overflow-hidden rounded-xl border border-white/9 bg-[#171815]/88 shadow-[0_20px_60px_rgba(0,0,0,.3)] backdrop-blur">
          <div className="relative min-h-[235px] overflow-hidden border-b border-white/8 bg-[radial-gradient(circle_at_50%_5%,rgba(215,182,110,.22),transparent_58%)]">
            <div
              className={`absolute top-5 left-1/2 h-44 w-44 -translate-x-1/2 rounded-full border bg-[#24241e] transition-all duration-300 ${isSpeaking ? "border-[#d7b66e]/55 shadow-[0_0_0_8px_rgba(215,182,110,.06),0_0_45px_rgba(215,182,110,.18)]" : "border-white/10"}`}
            >
              <Image
                src={`${LAB_ASSET_BASE}/portrait`}
                alt="Temporary puzzle coach reference"
                fill
                loading="eager"
                sizes="176px"
                className="rounded-full object-cover object-top"
                unoptimized
              />
              {isSpeaking && (
                <span
                  className="absolute top-[54.2%] left-1/2 z-10 -translate-x-1/2 bg-[#3a2019] shadow-[inset_0_2px_0_rgba(255,255,255,.16)] transition-[width,height] duration-75"
                  style={{
                    width: `${mouth.width}px`,
                    height: `${mouth.height}px`,
                    borderRadius: `${mouth.radius}%`,
                  }}
                />
              )}
            </div>
            <div className="absolute right-4 bottom-4 left-4 flex items-center justify-between rounded-full border border-white/8 bg-black/30 px-3 py-2 text-[10px] font-semibold tracking-[.1em] text-white/42 uppercase backdrop-blur">
              <span>{isSpeaking ? "Coach speaking" : "Coach ready"}</span>
              <span className="flex h-4 items-end gap-0.5" aria-hidden="true">
                {[5, 10, 7, 13, 8].map((height, index) => (
                  <span
                    key={index}
                    className={`w-0.5 rounded-full bg-[#d7b66e] transition-all ${isSpeaking ? "animate-pulse" : "opacity-25"}`}
                    style={{ height: `${isSpeaking ? height : 3}px` }}
                  />
                ))}
              </span>
            </div>
          </div>

          <div className="flex flex-1 flex-col p-5">
            <div className="relative rounded-xl border border-white/9 bg-white/[.035] p-4">
              <span className="absolute -top-2 left-7 h-4 w-4 rotate-45 border-t border-l border-white/9 bg-[#1d1e1b]" />
              <p className="relative text-[15px] leading-6 text-white/82" aria-live="polite">
                {started
                  ? solved
                    ? feedback
                    : puzzle.coachLine
                  : "I have a position waiting for you."}
              </p>
            </div>

            <p className="mt-4 min-h-12 text-sm leading-5 text-[#c8c2b5]" aria-live="polite">
              {feedback}
            </p>

            <div className="mt-auto grid grid-cols-2 gap-2 pt-5">
              <button
                type="button"
                onClick={playNarration}
                className="cursor-pointer rounded-lg border border-white/10 bg-white/[.04] px-3 py-3 text-xs font-semibold text-white/70 transition-colors hover:bg-white/[.08] hover:text-white"
              >
                Replay coach
              </button>
              <button
                type="button"
                onClick={toggleMuted}
                className="cursor-pointer rounded-lg border border-white/10 bg-white/[.04] px-3 py-3 text-xs font-semibold text-white/70 transition-colors hover:bg-white/[.08] hover:text-white"
              >
                {muted ? "Unmute" : "Mute"}
              </button>
              <button
                type="button"
                onClick={solved ? showAward : revealHint}
                disabled={!started || (!solved && hintLevel >= 3)}
                className="cursor-pointer rounded-lg border border-[#d7b66e]/25 bg-[#d7b66e]/8 px-3 py-3 text-xs font-semibold text-[#d7b66e] transition-colors hover:bg-[#d7b66e]/14 disabled:cursor-not-allowed disabled:opacity-35"
              >
                {solved
                  ? `Collect ${puzzleAward.total} XP`
                  : hintLevel >= 3
                    ? "Move shown"
                    : `Hint ${hintLevel + 1} of 3`}
              </button>
              <button
                type="button"
                onClick={resetPuzzle}
                className="cursor-pointer rounded-lg border border-white/10 bg-white/[.04] px-3 py-3 text-xs font-semibold text-white/70 transition-colors hover:bg-white/[.08] hover:text-white"
              >
                Reset board
              </button>
            </div>
          </div>
        </aside>
      </div>

      {labPhase !== "puzzle" && collectedAward && (
        <div className="absolute inset-0 z-40 overflow-y-auto bg-[#090a08]/94 p-4 backdrop-blur-md sm:p-8">
          <div className="grid min-h-full place-items-center">
            {labPhase === "award" ? (
              <PuzzleAwardPreview
                award={collectedAward}
                onBack={() => setLabPhase("puzzle")}
                onContinue={collectAward}
              />
            ) : (
              <PuzzlePathPreview
                award={collectedAward}
                previousXp={previousPathXp}
                xp={pathXp}
                onContinue={continueTraining}
                onReset={resetCapturedPath}
              />
            )}
          </div>
        </div>
      )}

      <audio
        key={puzzle.id}
        ref={audioRef}
        src={`${LAB_ASSET_BASE}/audio-${puzzle.id}`}
        preload="metadata"
        onPlay={() => setIsSpeaking(true)}
        onEnded={() => {
          setIsSpeaking(false);
          setCurrentViseme(null);
        }}
        onPause={() => {
          setIsSpeaking(false);
          setCurrentViseme(null);
        }}
      />

      <details className="group border-t border-white/8 bg-black/15 px-5 py-4 sm:px-8">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-xs font-semibold text-white/45 marker:hidden hover:text-white/70">
          <span>Reference diagnostics</span>
          <span className="font-mono text-[10px] tracking-[.08em] text-white/28 uppercase">
            {visemes.length} cues / viseme {currentViseme ?? "off"}
          </span>
        </summary>
        <div className="grid gap-4 pt-4 text-xs text-white/45 sm:grid-cols-[1fr_auto] sm:items-center">
          <div>
            <p className="font-semibold text-white/65">{engineMessage}</p>
            <p className="mt-1 leading-5">
              The engine remains unloaded during normal design testing. This control verifies the
              captured worker boundary only.
            </p>
          </div>
          <button
            type="button"
            onClick={startReferenceEngine}
            disabled={engineState === "loading" || engineState === "ready"}
            className="cursor-pointer rounded-lg border border-white/10 bg-white/[.04] px-4 py-2.5 font-semibold text-white/65 transition-colors hover:bg-white/[.08] disabled:cursor-not-allowed disabled:opacity-45"
          >
            {engineState === "loading"
              ? "Loading engine..."
              : engineState === "ready"
                ? "Engine ready"
                : "Start reference engine"}
          </button>
        </div>
      </details>
    </section>
  );
}
