"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckIcon, ChevronLeftIcon } from "@/components/ui/icons";
import { CasinoError, CasinoLoading } from "@/features/casino/components/casino-state";
import { ChessBoard } from "@/features/casino/components/chess/chess-board";
import { useCasinoWallet } from "@/features/casino/hooks/use-casino-wallet";
import {
  attemptCoachLesson,
  attemptCoachTraining,
  fetchCoachCatalog,
  fetchCoachHome,
  fetchCoachTraining,
  updateCoachProfile,
} from "@/features/casino/lib/api/chess";
import { newChessIdempotencyKey } from "@/features/casino/lib/api/chess-idempotency";
import type {
  ChessCoachChapter,
  ChessCoachExperience,
  ChessCoachLesson,
  ChessCoachLessonState,
  ChessCoachTrainingItem,
} from "@/features/casino/lib/api/types";
import { BOARD_THEMES, DEFAULT_THEME } from "@/features/casino/lib/chess/board-theme";
import {
  applyUciToFen,
  fromUci,
  legalMovesForSquare,
  parseFen,
  squareName,
  toUci,
  type Square,
} from "@/features/casino/lib/chess/engine";
import { CHESS_SURFACE_BG } from "@/features/casino/lib/chess/ui";
import { friendlyError } from "@/lib/errors";
import { toast } from "@/lib/toast";

const LEARN_THEME = BOARD_THEMES.find((theme) => theme.id === "green") ?? DEFAULT_THEME;

type CoachMode = "home" | "train" | "lessons";
type OnboardingStep = "intro" | "experience";

interface Exercise {
  id: string;
  lessonKey: string;
  lessonTitle: string;
  lessonSummary: string;
  chapter: ChessCoachChapter;
  training: ChessCoachTrainingItem | null;
}

function trainingExercise(item: ChessCoachTrainingItem): Exercise | null {
  if (!item.bestUci) return null;
  return {
    id: `training:${item.matchId}:${item.ply}`,
    lessonKey: "mistake-review",
    lessonTitle: "Practice from your games",
    lessonSummary: `${item.classification} on move ${item.ply} · ${item.motif}`,
    training: item,
    chapter: {
      key: `${item.matchId}:${item.ply}`,
      title: "Find a stronger continuation",
      instruction: `You played ${item.playedSan}. Find the move that improves the position.`,
      fen: item.fen,
      side: item.side,
      targetUci: item.bestUci,
      hints: [],
      successMessage: "You found the correction. Return to it later and solve it from memory.",
    },
  };
}

function CoachPortrait({ small = false }: { small?: boolean }) {
  return (
    <div
      className={`grid shrink-0 place-items-center rounded-full border border-[#d8b36a]/45 bg-[radial-gradient(circle_at_35%_28%,#e7c782,#5f4424_72%)] font-serif font-bold text-[#20170d] shadow-[0_8px_28px_rgba(0,0,0,.35)] ${small ? "h-12 w-12 text-xl" : "h-24 w-24 text-4xl"}`}
      aria-label="Ark chess coach"
    >
      A
    </div>
  );
}

function ModeNav({ mode, onMode }: { mode: CoachMode; onMode: (mode: CoachMode) => void }) {
  const item = (value: CoachMode, label: string) => (
    <button
      type="button"
      onClick={() => onMode(value)}
      className={`min-w-0 flex-1 cursor-pointer px-2 py-3 text-[11px] font-semibold tracking-[0.04em] uppercase transition-colors ${
        mode === value ? "text-[#d8b36a]" : "text-white/42 hover:text-white/76"
      }`}
    >
      {label}
    </button>
  );
  return (
    <nav className="sticky bottom-0 z-20 mt-5 flex border-t border-white/8 bg-[#151412]/96 backdrop-blur">
      {item("home", "Home")}
      <Link
        href="/casino/chess?computer=1"
        className="min-w-0 flex-1 px-2 py-3 text-center text-[11px] font-semibold tracking-[0.04em] text-white/42 uppercase transition-colors hover:text-white/76"
      >
        Play
      </Link>
      {item("train", "Train")}
      {item("lessons", "Lessons")}
    </nav>
  );
}

function statusByLesson(items: ChessCoachLessonState[]) {
  return new Map(items.map((item) => [item.lessonKey, item]));
}

export function LearnSection() {
  const wallet = useCasinoWallet();
  const queryClient = useQueryClient();
  const player = wallet.address;
  const [mode, setMode] = useState<CoachMode>("home");
  const [onboardingStep, setOnboardingStep] = useState<OnboardingStep>("intro");
  const [activeLessonKey, setActiveLessonKey] = useState<string | null>(null);
  const [chapterIndex, setChapterIndex] = useState(0);
  const [activeTraining, setActiveTraining] = useState<ChessCoachTrainingItem | null>(null);
  const [fen, setFen] = useState<string | null>(null);
  const [selected, setSelected] = useState<Square | null>(null);
  const [feedback, setFeedback] = useState("Select a piece and make the requested move.");
  const [attempts, setAttempts] = useState(0);
  const [hintStep, setHintStep] = useState(0);
  const [complete, setComplete] = useState(false);

  const catalogQuery = useQuery({
    queryKey: ["casino", "chess", "coach-catalog"],
    queryFn: fetchCoachCatalog,
    staleTime: 60 * 60 * 1000,
  });
  const homeQuery = useQuery({
    queryKey: ["casino", "chess", "coach-home", player ?? "guest"],
    queryFn: () => fetchCoachHome(player as string),
    enabled: !!player,
  });
  const trainingQuery = useQuery({
    queryKey: ["casino", "chess", "coach-training", player ?? "guest"],
    queryFn: () => fetchCoachTraining(player as string, 20),
    enabled: !!player,
    retry: false,
  });
  const profileMutation = useMutation({
    mutationFn: (experience: ChessCoachExperience) =>
      updateCoachProfile(player as string, {
        experience,
        onboardingComplete: true,
        preferredMode: "lessons",
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["casino", "chess", "coach-home", player],
      });
      setMode("lessons");
    },
  });

  const catalog = catalogQuery.data;
  const home = homeQuery.data;
  const lessons = useMemo(
    () => catalog?.sections.flatMap((section) => section.lessons) ?? [],
    [catalog]
  );
  const lessonStates = useMemo(() => statusByLesson(home?.lessons ?? []), [home?.lessons]);
  const activeLesson = lessons.find((lesson) => lesson.key === activeLessonKey) ?? null;
  const activeChapter = activeLesson?.chapters[chapterIndex] ?? null;
  const exercise: Exercise | null = activeTraining
    ? trainingExercise(activeTraining)
    : activeLesson && activeChapter
      ? {
          id: `lesson:${activeLesson.key}:${activeChapter.key}`,
          lessonKey: activeLesson.key,
          lessonTitle: activeLesson.title,
          lessonSummary: activeLesson.summary,
          chapter: activeChapter,
          training: null,
        }
      : null;

  const resetExercise = (chapter: ChessCoachChapter) => {
    setFen(chapter.fen);
    setSelected(null);
    setFeedback(chapter.instruction);
    setAttempts(0);
    setHintStep(0);
    setComplete(false);
  };

  const position = useMemo(() => {
    if (!fen) return null;
    try {
      return parseFen(fen);
    } catch {
      return null;
    }
  }, [fen]);
  const expectedMove = exercise ? fromUci(exercise.chapter.targetUci) : null;
  const legalMoves = useMemo(() => {
    if (!position || !selected || complete) return [];
    return legalMovesForSquare(position, selected.r, selected.c);
  }, [complete, position, selected]);
  const showSolution = !!expectedMove && hintStep >= 3;
  const legalTargets = showSolution ? [expectedMove.to] : legalMoves.map((move) => move.to);

  const openLesson = (lesson: ChessCoachLesson) => {
    const state = lessonStates.get(lesson.key);
    const firstChapter = lesson.chapters[0];
    if (state?.status === "locked" || !firstChapter) return;
    setActiveTraining(null);
    setActiveLessonKey(lesson.key);
    setChapterIndex(0);
    resetExercise(firstChapter);
  };

  const openTraining = (item: ChessCoachTrainingItem) => {
    const nextExercise = trainingExercise(item);
    if (!nextExercise) return;
    setActiveLessonKey(null);
    setChapterIndex(0);
    setActiveTraining(item);
    resetExercise(nextExercise.chapter);
  };

  const closeExercise = () => {
    setActiveLessonKey(null);
    setActiveTraining(null);
    setMode(activeTraining ? "train" : "lessons");
  };

  const submitAttempt = async (uci: string) => {
    if (!exercise || !player) return;
    try {
      if (exercise.training) {
        const result = await attemptCoachTraining(
          player,
          exercise.training.matchId,
          exercise.training.ply,
          uci,
          newChessIdempotencyKey()
        );
        setAttempts(result.attempts);
        setHintStep(result.hintLevel);
        setFeedback(result.message);
        if (!result.correct) {
          if (result.suggestedUci) setSelected(fromUci(result.suggestedUci)?.from ?? null);
          return;
        }
      } else {
        const result = await attemptCoachLesson(
          exercise.lessonKey,
          exercise.chapter.key,
          player,
          uci,
          newChessIdempotencyKey()
        );
        setAttempts(result.attempts);
        setFeedback(result.correct ? result.message : (result.nextHint ?? result.message));
        if (!result.correct) return;
      }
      const nextPosition = applyUciToFen(exercise.chapter.fen, uci);
      if (!nextPosition) {
        throw new Error("The accepted coach move could not be applied locally.");
      }
      setFen(nextPosition.fen);
      setComplete(true);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["casino", "chess", "coach-home", player] }),
        queryClient.invalidateQueries({
          queryKey: ["casino", "chess", "coach-training", player],
        }),
      ]);
    } catch (error) {
      toast.error(friendlyError(error, "The coach could not check that move."));
    }
  };

  const onSquareClick = (r: number, c: number) => {
    if (!position || !exercise || complete) return;
    const destination = { r, c };
    const piece = position.board[r]?.[c];
    if (!selected) {
      setSelected(piece?.color === position.turn ? destination : null);
      return;
    }
    const candidates = legalMoves.filter((move) => move.to.r === r && move.to.c === c);
    if (candidates.length === 0) {
      setSelected(piece?.color === position.turn ? destination : null);
      setFeedback(
        piece?.color === position.turn
          ? "Try that piece from its new square."
          : `${squareName(r, c)} is not a legal destination from the selected square.`
      );
      return;
    }
    const promotion = exercise.chapter.targetUci[4];
    const uci = toUci(
      position,
      selected,
      destination,
      promotion === "q" || promotion === "r" || promotion === "b" || promotion === "n"
        ? promotion
        : undefined
    );
    setSelected(null);
    void submitAttempt(uci);
  };

  const onHint = () => {
    if (!exercise || complete) return;
    const next = Math.min(3, hintStep + 1);
    setHintStep(next);
    const hint = exercise.chapter.hints[next - 1];
    if (hint) {
      setFeedback(hint);
    } else if (next >= 3 && expectedMove) {
      setSelected(expectedMove.from);
      setFeedback("The starting square and destination are now highlighted.");
    } else {
      setFeedback("Start with checks, captures, and direct threats.");
    }
  };

  const onNext = () => {
    if (!activeLesson || activeTraining) {
      closeExercise();
      return;
    }
    const nextChapter = activeLesson.chapters[chapterIndex + 1];
    if (nextChapter) {
      setChapterIndex((value) => value + 1);
      resetExercise(nextChapter);
      return;
    }
    closeExercise();
  };

  if (!player) {
    return (
      <div className="mx-auto w-full max-w-[560px] px-4 py-16 text-center">
        <CoachPortrait />
        <h1 className="mt-5 text-3xl font-semibold text-white">
          Sign in to start your chess course
        </h1>
        <p className="mt-2 text-sm leading-6 text-white/52">
          Your lessons, mistakes, and progress follow your account across devices.
        </p>
      </div>
    );
  }
  if (catalogQuery.isLoading || homeQuery.isLoading || !catalog || !home) {
    return (
      <div className="mx-auto w-full max-w-[720px] px-4 py-10">
        <CasinoLoading label="Preparing your chess coach…" rows={5} />
      </div>
    );
  }
  if (catalogQuery.error || homeQuery.error) {
    return (
      <div className="mx-auto w-full max-w-[720px] px-4 py-10">
        <CasinoError error={catalogQuery.error ?? homeQuery.error} subject="Chess coach" />
      </div>
    );
  }

  if (!home.profile.onboardingComplete) {
    return (
      <main className="mx-auto flex min-h-[calc(100dvh-80px)] w-full max-w-[560px] flex-col items-center justify-center px-5 py-10 text-center">
        <CoachPortrait />
        {onboardingStep === "intro" ? (
          <>
            <h1 className="mt-6 font-serif text-[34px] leading-tight text-white">
              How should your coach begin?
            </h1>
            <p className="mt-3 max-w-md text-[14px] leading-6 text-white/55">
              Start with guided lessons or go directly to a coached game. You can switch modes at
              any time.
            </p>
            <div className="mt-7 grid w-full gap-3">
              <button
                type="button"
                onClick={() => setOnboardingStep("experience")}
                className="cursor-pointer rounded-xl bg-[#d8b36a] px-5 py-3.5 text-sm font-bold text-[#20170d]"
              >
                Learn from the beginning
              </button>
              <Link
                href="/casino/chess?computer=1&coach=1"
                className="rounded-xl border border-white/14 px-5 py-3.5 text-sm font-semibold text-white/74 hover:border-white/28 hover:text-white"
              >
                Play a coached game
              </Link>
            </div>
          </>
        ) : (
          <>
            <h1 className="mt-6 font-serif text-[32px] leading-tight text-white">
              What is your chess experience?
            </h1>
            <p className="mt-3 text-[14px] leading-6 text-white/52">
              This sets the starting point. Your lesson progress still controls what unlocks next.
            </p>
            <div className="mt-7 grid w-full gap-3">
              {(["beginner", "intermediate", "advanced"] as const).map((experience) => (
                <button
                  key={experience}
                  type="button"
                  disabled={profileMutation.isPending}
                  onClick={() => profileMutation.mutate(experience)}
                  className="cursor-pointer rounded-xl border border-white/12 bg-white/[0.035] px-5 py-3.5 text-left text-sm font-semibold text-white/78 capitalize hover:border-[#d8b36a]/55 hover:bg-[#d8b36a]/8"
                >
                  {experience}
                </button>
              ))}
            </div>
          </>
        )}
      </main>
    );
  }

  if (exercise && position) {
    return (
      <main className="mx-auto w-full max-w-[980px] px-3 py-4 sm:px-5">
        <button
          type="button"
          onClick={closeExercise}
          className="mb-3 inline-flex cursor-pointer items-center gap-1.5 text-xs text-white/48 hover:text-white"
        >
          <ChevronLeftIcon size={13} /> Back
        </button>
        <div className="grid items-start gap-4 md:grid-cols-[minmax(0,650px)_280px]">
          <ChessBoard
            board={position.board}
            selected={showSolution && expectedMove ? expectedMove.from : selected}
            legalTargets={legalTargets}
            orientation={exercise.chapter.side === "black" ? "b" : "w"}
            theme={LEARN_THEME}
            onSquareClick={onSquareClick}
          />
          <aside className="overflow-hidden rounded-2xl border border-white/8 bg-[#1a1917] shadow-[0_18px_50px_rgba(0,0,0,.28)]">
            <div className="flex items-center gap-3 border-b border-white/7 p-4">
              <CoachPortrait small />
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-white">
                  {exercise.chapter.title}
                </div>
                <div className="truncate text-[11px] text-white/38">{exercise.lessonTitle}</div>
              </div>
            </div>
            <div className="p-4">
              <div className="rounded-xl bg-white/[0.045] px-3.5 py-3 text-[13px] leading-5 text-white/72">
                {feedback}
              </div>
              <div className="mt-3 text-[10px] font-semibold tracking-[0.08em] text-white/30 uppercase">
                {complete ? "Complete" : `Attempt ${Math.max(1, attempts + 1)}`}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {complete ? (
                  <button
                    type="button"
                    onClick={onNext}
                    className="cursor-pointer rounded-lg bg-[#d8b36a] px-4 py-2 text-xs font-bold text-[#20170d]"
                  >
                    {activeTraining ? "Back to training" : "Next"}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={onHint}
                    className="cursor-pointer rounded-lg border border-white/12 px-3.5 py-2 text-xs font-semibold text-white/68 hover:text-white"
                  >
                    {hintStep >= 3 ? "Move shown" : "Hint"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setFen(exercise.chapter.fen);
                    setSelected(null);
                    setFeedback(exercise.chapter.instruction);
                    setAttempts(0);
                    setHintStep(0);
                    setComplete(false);
                  }}
                  className="cursor-pointer px-2 py-2 text-xs text-white/38 hover:text-white/68"
                >
                  Restart
                </button>
              </div>
            </div>
          </aside>
        </div>
      </main>
    );
  }

  const training = (trainingQuery.data?.items ?? []).filter((item) => item.bestUci);
  return (
    <main className="mx-auto w-full max-w-[760px] px-3 py-4 sm:px-5">
      <div className="mb-4 flex items-center justify-between gap-4">
        <Link
          href="/casino/chess"
          className="inline-flex items-center gap-1.5 text-xs text-white/45 hover:text-white"
        >
          <ChevronLeftIcon size={13} /> Chess
        </Link>
        <div className="text-right">
          <div className="text-[10px] font-bold tracking-[0.1em] text-white/30 uppercase">
            Points
          </div>
          <div className="text-lg font-semibold text-[#d8b36a]">
            {home.earnedPoints}
            <span className="text-xs text-white/28">/{home.maximumPoints}</span>
          </div>
        </div>
      </div>

      {mode === "home" ? (
        <section
          className="overflow-hidden rounded-2xl border border-white/8"
          style={{ background: CHESS_SURFACE_BG }}
        >
          <div className="flex items-center gap-4 border-b border-white/7 p-5">
            <CoachPortrait />
            <div>
              <div className="text-[10px] font-bold tracking-[0.1em] text-[#d8b36a] uppercase">
                Your coach
              </div>
              <h1 className="mt-1 font-serif text-3xl text-white">Ready for the next position?</h1>
              <p className="mt-2 text-sm leading-6 text-white/48">
                Continue the course, repair a mistake from your games, or start a coached Stockfish
                match.
              </p>
            </div>
          </div>
          <div className="grid gap-3 p-4 sm:grid-cols-3">
            <button
              type="button"
              onClick={() => setMode("lessons")}
              className="cursor-pointer rounded-xl border border-white/8 bg-white/[0.035] p-4 text-left hover:border-[#d8b36a]/35"
            >
              <span className="text-sm font-semibold text-white">Continue lessons</span>
              <span className="mt-1 block text-xs leading-5 text-white/38">
                {home.recommendedLessonKey ? "Your next lesson is ready." : "Course complete."}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setMode("train")}
              className="cursor-pointer rounded-xl border border-white/8 bg-white/[0.035] p-4 text-left hover:border-[#d8b36a]/35"
            >
              <span className="text-sm font-semibold text-white">Train mistakes</span>
              <span className="mt-1 block text-xs leading-5 text-white/38">
                {home.trainingPositionCount} positions waiting.
              </span>
            </button>
            <Link
              href="/casino/chess?computer=1&coach=1"
              className="rounded-xl border border-white/8 bg-white/[0.035] p-4 text-left hover:border-[#d8b36a]/35"
            >
              <span className="text-sm font-semibold text-white">Play with coach</span>
              <span className="mt-1 block text-xs leading-5 text-white/38">
                Choose Stockfish level and color.
              </span>
            </Link>
          </div>
        </section>
      ) : null}

      {mode === "train" ? (
        <section
          className="rounded-2xl border border-white/8 p-4"
          style={{ background: CHESS_SURFACE_BG }}
        >
          <div className="flex items-center gap-3">
            <CoachPortrait small />
            <div>
              <h1 className="font-serif text-2xl text-white">Train your mistakes</h1>
              <p className="mt-0.5 text-xs text-white/40">
                Positions from completed game analysis.
              </p>
            </div>
          </div>
          {training.length === 0 ? (
            <div className="py-14 text-center">
              <p className="text-sm text-white/58">No training positions yet.</p>
              <p className="mx-auto mt-2 max-w-sm text-xs leading-5 text-white/35">
                Finish a game and request analysis. Mistakes with a stronger continuation will
                appear here.
              </p>
            </div>
          ) : (
            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              {training.map((item) => (
                <button
                  key={`${item.matchId}:${item.ply}`}
                  type="button"
                  onClick={() => openTraining(item)}
                  className="cursor-pointer rounded-xl border border-white/8 bg-white/[0.03] p-3.5 text-left hover:border-[#d8b36a]/35"
                >
                  <span className="text-xs font-semibold text-white/78 capitalize">
                    {item.classification}
                  </span>
                  <span className="mt-1 block text-[11px] text-white/38">
                    Move {item.ply}: {item.playedSan} · {item.phase}
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>
      ) : null}

      {mode === "lessons" ? (
        <section
          className="rounded-2xl border border-white/8 p-4 sm:p-5"
          style={{ background: CHESS_SURFACE_BG }}
        >
          <div className="mb-5">
            <h1 className="font-serif text-3xl text-white">Lessons</h1>
            <p className="mt-1 text-xs text-white/40">
              Complete each node to unlock the next skill.
            </p>
          </div>
          <div className="space-y-8">
            {catalog.sections.map((section) => (
              <div key={section.key}>
                <div className="mb-3 text-center">
                  <h2 className="text-sm font-semibold text-white/76">{section.title}</h2>
                  <p className="mt-1 text-[11px] text-white/34">{section.summary}</p>
                </div>
                <div className="mx-auto grid max-w-[540px] grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
                  {section.lessons.map((lesson, index) => {
                    const state = lessonStates.get(lesson.key);
                    const locked = state?.status === "locked";
                    const done = state?.status === "completed";
                    return (
                      <button
                        key={lesson.key}
                        type="button"
                        disabled={locked}
                        onClick={() => openLesson(lesson)}
                        className={`group relative flex cursor-pointer flex-col items-center rounded-xl px-2 py-3 text-center disabled:cursor-not-allowed ${index % 2 ? "sm:translate-y-3" : ""}`}
                      >
                        <span
                          className={`grid h-14 w-14 place-items-center rounded-full border text-sm font-bold transition-transform group-hover:scale-105 ${
                            done
                              ? "border-[#d8b36a] bg-[#d8b36a] text-[#20170d]"
                              : locked
                                ? "border-white/7 bg-white/[0.025] text-white/18"
                                : "border-[#d8b36a]/45 bg-[#d8b36a]/10 text-[#d8b36a]"
                          }`}
                        >
                          {done ? <CheckIcon size={18} /> : locked ? "·" : lesson.difficulty}
                        </span>
                        <span
                          className={`mt-2 text-[11px] font-semibold ${locked ? "text-white/22" : "text-white/72"}`}
                        >
                          {lesson.title}
                        </span>
                        <span className="mt-0.5 text-[9px] text-white/28">
                          {state?.earnedPoints ?? 0}/{lesson.maximumPoints}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <ModeNav mode={mode} onMode={setMode} />
    </main>
  );
}
