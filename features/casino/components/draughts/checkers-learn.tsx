"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeftIcon } from "@/components/ui/icons";
import { CasinoError, CasinoLoading } from "@/features/casino/components/casino-state";
import { DraughtsMoveTable } from "@/features/casino/components/draughts/draughts-move-table";
import { DraughtsTrainingBoard } from "@/features/casino/components/draughts/draughts-training-board";
import {
  DRAUGHTS_PANEL_BUTTON_CLASS,
  DRAUGHTS_PANEL_HEADER_CLASS,
  DraughtsWorkspace,
} from "@/features/casino/components/draughts/draughts-workspace";
import { useCasinoWallet } from "@/features/casino/hooks/use-casino-wallet";
import {
  attemptCoachLesson,
  attemptCoachTraining,
  fetchCoachCatalog,
  fetchCoachHome,
  fetchCoachTraining,
  updateCoachProfile,
} from "@/features/casino/lib/api/draughts";
import {
  applyMove,
  exportFen,
  moveToSan,
  moveToUci,
  parseFen,
  parseUci,
  type DraughtsMove,
} from "@/features/casino/lib/draughts/engine";
import { DRAUGHTS_VARIANT_OPTIONS } from "@/features/casino/lib/draughts/variants";
import type {
  DraughtsCoachChapter,
  DraughtsCoachExperience,
  DraughtsCoachLesson,
  DraughtsCoachTrainingItem,
} from "@/features/casino/lib/draughts/types";
import { friendlyError } from "@/lib/errors";
import { toast } from "@/lib/toast";

type LearnMode = "lessons" | "training";

interface Exercise {
  id: string;
  lessonKey: string;
  lessonTitle: string;
  lessonSummary: string;
  chapter: DraughtsCoachChapter;
  training: DraughtsCoachTrainingItem | null;
}

function trainingExercise(item: DraughtsCoachTrainingItem): Exercise | null {
  if (!item.bestUci) return null;
  return {
    id: `training:${item.matchId}:${item.ply}`,
    lessonKey: "mistake-review",
    lessonTitle: "Practice from your games",
    lessonSummary: `${item.classification} · ${item.motif}`,
    training: item,
    chapter: {
      key: `${item.matchId}:${item.ply}`,
      title: "Find the stronger move",
      instruction: "This position came from one of your games. Find the best continuation.",
      variant: item.variant,
      fen: item.fen,
      side: item.side,
      targetUci: item.bestUci,
      hints: item.principalVariation ? [`Candidate line: ${item.principalVariation}`] : [],
      successMessage: "Best move. Keep this pattern in memory for your next game.",
    },
  };
}

function variantLabel(key: string): string {
  return DRAUGHTS_VARIANT_OPTIONS.find((variant) => variant.id === key)?.label ?? key;
}

export function CheckersLearn() {
  const wallet = useCasinoWallet();
  const player = wallet.address;
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<LearnMode>("lessons");
  const [activeLessonKey, setActiveLessonKey] = useState<string | null>(null);
  const [chapterIndex, setChapterIndex] = useState(0);
  const [activeTraining, setActiveTraining] = useState<DraughtsCoachTrainingItem | null>(null);
  const [fen, setFen] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("Find the best move.");
  const [attempts, setAttempts] = useState(0);
  const [hintStep, setHintStep] = useState(0);
  const [complete, setComplete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [transcript, setTranscript] = useState<string[]>([]);
  const [lastCorrect, setLastCorrect] = useState<boolean | null>(null);

  const catalogQuery = useQuery({
    queryKey: ["casino", "draughts", "coach-catalog"],
    queryFn: fetchCoachCatalog,
    staleTime: 60 * 60 * 1000,
  });
  const homeQuery = useQuery({
    queryKey: ["casino", "draughts", "coach-home", player ?? "guest"],
    queryFn: () => fetchCoachHome(player as string),
    enabled: !!player,
  });
  const trainingQuery = useQuery({
    queryKey: ["casino", "draughts", "coach-training", player ?? "guest"],
    queryFn: () => fetchCoachTraining(player as string, 20),
    enabled: !!player,
    retry: false,
  });
  const profileMutation = useMutation({
    mutationFn: (experience: DraughtsCoachExperience) =>
      updateCoachProfile(player as string, {
        experience,
        onboardingComplete: true,
        preferredMode: "lessons",
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ["casino", "draughts", "coach-home", player],
      }),
  });

  const catalog = catalogQuery.data;
  const home = homeQuery.data;
  const lessons = useMemo(
    () => catalog?.sections.flatMap((section) => section.lessons) ?? [],
    [catalog]
  );
  const lessonStates = useMemo(
    () => new Map((home?.lessons ?? []).map((lesson) => [lesson.lessonKey, lesson])),
    [home?.lessons]
  );
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

  const resetExercise = (chapter: DraughtsCoachChapter) => {
    setFen(chapter.fen);
    setFeedback(chapter.instruction);
    setAttempts(0);
    setHintStep(0);
    setComplete(false);
    setTranscript([]);
    setLastCorrect(null);
  };

  const openLesson = (lesson: DraughtsCoachLesson) => {
    const state = lessonStates.get(lesson.key);
    const chapter = lesson.chapters[0];
    if (!chapter || state?.status === "locked") return;
    setActiveTraining(null);
    setActiveLessonKey(lesson.key);
    setChapterIndex(0);
    resetExercise(chapter);
  };

  const openTraining = (item: DraughtsCoachTrainingItem) => {
    const next = trainingExercise(item);
    if (!next) return;
    setActiveLessonKey(null);
    setActiveTraining(item);
    resetExercise(next.chapter);
  };

  const closeExercise = () => {
    setActiveLessonKey(null);
    setActiveTraining(null);
    setFen(null);
  };

  const submit = async (move: DraughtsMove) => {
    if (!exercise || !player || !fen || busy || complete) return;
    const uci = moveToUci(move);
    const san = moveToSan(move);
    setBusy(true);
    try {
      const result = exercise.training
        ? await attemptCoachTraining(
            player,
            exercise.training.matchId,
            exercise.training.ply,
            uci,
            crypto.randomUUID()
          )
        : await attemptCoachLesson(
            exercise.lessonKey,
            exercise.chapter.key,
            player,
            uci,
            crypto.randomUUID()
          );
      setAttempts(result.attempts);
      setTranscript((moves) => [...moves, san]);
      setLastCorrect(result.correct);
      setFeedback(result.message);
      if ("hintLevel" in result) setHintStep(result.hintLevel);
      if (!result.correct) {
        if ("nextHint" in result && result.nextHint) setFeedback(result.nextHint);
        return;
      }
      setFen(exportFen(applyMove(parseFen(fen, exercise.chapter.variant), move)));
      setComplete(true);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["casino", "draughts", "coach-home", player],
        }),
        queryClient.invalidateQueries({
          queryKey: ["casino", "draughts", "coach-training", player],
        }),
      ]);
    } catch (cause) {
      toast.error(friendlyError(cause, "The coach could not check that move."));
    } finally {
      setBusy(false);
    }
  };

  const showHint = () => {
    if (!exercise || complete) return;
    const next = Math.min(3, hintStep + 1);
    setHintStep(next);
    setFeedback(
      exercise.chapter.hints[next - 1] ??
        (next >= 3
          ? "The solution is highlighted on the board."
          : "Look at every forced capture before considering a quiet move.")
    );
  };

  const nextExercise = () => {
    if (!activeLesson || activeTraining) {
      closeExercise();
      return;
    }
    const next = activeLesson.chapters[chapterIndex + 1];
    if (!next) {
      closeExercise();
      return;
    }
    setChapterIndex((index) => index + 1);
    resetExercise(next);
  };

  if (!player) {
    return (
      <div className="mx-auto max-w-xl px-5 py-20 text-center">
        <h1 className="text-3xl font-semibold text-white">Sign in to train checkers</h1>
        <p className="mt-3 text-sm leading-6 text-white/50">
          Your lessons, solved positions, and mistakes are saved to your account.
        </p>
      </div>
    );
  }
  if (catalogQuery.isLoading || homeQuery.isLoading || !catalog || !home) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <CasinoLoading label="Preparing your draughts course…" rows={5} />
      </div>
    );
  }
  if (catalogQuery.error || homeQuery.error) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <CasinoError error={catalogQuery.error ?? homeQuery.error} subject="Checkers coach" />
      </div>
    );
  }

  if (!home.profile.onboardingComplete) {
    return (
      <main className="mx-auto flex min-h-[calc(100dvh-90px)] max-w-xl flex-col justify-center px-5 py-10">
        <p className="text-xs font-semibold tracking-[0.14em] text-amber-200/70 uppercase">
          Ark draughts academy
        </p>
        <h1 className="mt-3 text-4xl leading-tight font-semibold text-white">
          Where should your training begin?
        </h1>
        <p className="mt-3 text-sm leading-6 text-white/52">
          This chooses the first course. Progress still unlocks the later lessons one chapter at a
          time.
        </p>
        <div className="mt-7 grid gap-3">
          {(["beginner", "intermediate", "advanced"] as const).map((experience) => (
            <button
              key={experience}
              type="button"
              disabled={profileMutation.isPending}
              onClick={() => profileMutation.mutate(experience)}
              className="cursor-pointer rounded-md border border-white/12 bg-white/[0.035] px-5 py-4 text-left text-sm font-semibold text-white/78 capitalize transition-colors hover:border-amber-200/45 hover:bg-amber-200/[0.06]"
            >
              {experience}
            </button>
          ))}
        </div>
      </main>
    );
  }

  if (exercise && fen) {
    const solution = hintStep >= 3 ? (parseUci(exercise.chapter.targetUci) ?? []) : [];
    const marks = transcript.reduce<Record<number, { symbol: string; tone: "good" | "bad" }>>(
      (all, _move, index) => {
        all[index + 1] = {
          symbol: index === transcript.length - 1 && lastCorrect ? "✓" : "✕",
          tone: index === transcript.length - 1 && lastCorrect ? "good" : "bad",
        };
        return all;
      },
      {}
    );

    return (
      <DraughtsWorkspace
        aside={
          <div className="space-y-3">
            <button
              type="button"
              onClick={closeExercise}
              className="inline-flex cursor-pointer items-center gap-1.5 text-[13px] text-white/48 hover:text-white"
            >
              <ChevronLeftIcon size={13} /> Training
            </button>
            <div className="rounded border border-white/10 bg-white/[0.035] p-4">
              <p className="text-xs font-semibold text-amber-200/70">
                {variantLabel(exercise.chapter.variant)} training
              </p>
              <h1 className="mt-2 text-xl font-semibold text-white">{exercise.chapter.title}</h1>
              <p className="mt-1.5 text-[13px] leading-5 text-white/48">{exercise.lessonSummary}</p>
              <div className="mt-4 border-t border-white/8 pt-4 text-[12px] text-white/40">
                <p>Difficulty {activeLesson?.difficulty ?? 1}</p>
                <p className="mt-1">Attempt {Math.max(1, attempts + (complete ? 0 : 1))}</p>
              </div>
            </div>
          </div>
        }
        board={
          <DraughtsTrainingBoard
            fen={fen}
            variant={exercise.chapter.variant}
            orientation={exercise.chapter.side}
            enabled={!busy && !complete}
            hintPath={solution}
            onMove={submit}
          />
        }
        panel={
          <>
            <div className={DRAUGHTS_PANEL_HEADER_CLASS}>
              <div>
                <p className="text-[12px] font-semibold text-white/72">Moves</p>
                <p className="text-[10px] text-white/30">
                  {variantLabel(exercise.chapter.variant)}
                </p>
              </div>
            </div>
            <DraughtsMoveTable moves={transcript} marks={marks} />
            <div className="flex min-h-[190px] flex-col justify-center border-b border-white/10 p-5">
              <div className="flex items-center gap-4">
                <span
                  className={`text-5xl leading-none ${
                    complete
                      ? "text-emerald-400"
                      : lastCorrect === false
                        ? "text-red-400"
                        : "text-white/30"
                  }`}
                  aria-hidden
                >
                  {complete ? "✓" : lastCorrect === false ? "✕" : "●"}
                </span>
                <div>
                  <strong className="block text-xl text-white">
                    {complete
                      ? "Puzzle complete!"
                      : lastCorrect === false
                        ? "Try again"
                        : "Your turn"}
                  </strong>
                  <span className="mt-1 block text-[13px] leading-5 text-white/48">{feedback}</span>
                </div>
              </div>
              {!complete ? (
                <button
                  type="button"
                  onClick={showHint}
                  className="mt-5 cursor-pointer text-center text-[13px] font-semibold text-sky-300 hover:text-sky-200"
                >
                  {hintStep >= 3 ? "Solution shown" : "View a hint"}
                </button>
              ) : null}
            </div>
            {complete ? (
              <button
                type="button"
                onClick={nextExercise}
                className="mt-auto flex min-h-20 cursor-pointer items-center justify-center gap-3 bg-sky-500 px-5 text-[15px] font-semibold tracking-[0.04em] text-white uppercase hover:bg-sky-400"
              >
                <span className="text-2xl" aria-hidden>
                  ▶
                </span>
                Continue training
              </button>
            ) : null}
          </>
        }
        controls={
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => resetExercise(exercise.chapter)}
              className={DRAUGHTS_PANEL_BUTTON_CLASS}
            >
              Restart
            </button>
          </div>
        }
      />
    );
  }

  const training = (trainingQuery.data?.items ?? []).filter((item) => item.bestUci);
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-5 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-white/10 pb-5">
        <div>
          <Link
            href="/casino/checkers"
            className="inline-flex items-center gap-1.5 text-[12px] text-white/42 hover:text-white"
          >
            <ChevronLeftIcon size={12} /> Checkers
          </Link>
          <h1 className="mt-3 text-3xl font-semibold text-white">Learn checkers</h1>
          <p className="mt-1 text-[13px] text-white/48">
            Rules, forced captures, kings, variants, and corrections from your games.
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-semibold tracking-[0.1em] text-white/30 uppercase">
            Points
          </p>
          <p className="text-xl font-semibold text-amber-200">
            {home.earnedPoints}
            <span className="text-xs text-white/25">/{home.maximumPoints}</span>
          </p>
        </div>
      </div>

      <div className="mt-5 flex gap-2 border-b border-white/8">
        {(["lessons", "training"] as const).map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setMode(item)}
            className={`cursor-pointer border-b-2 px-4 py-3 text-[13px] font-semibold capitalize ${
              mode === item
                ? "border-sky-400 text-white"
                : "border-transparent text-white/38 hover:text-white/70"
            }`}
          >
            {item}
          </button>
        ))}
      </div>

      {mode === "lessons" ? (
        <div className="mt-5 space-y-7">
          {catalog.sections.map((section) => (
            <section key={section.key}>
              <h2 className="text-lg font-semibold text-white">{section.title}</h2>
              <p className="mt-1 text-[13px] text-white/42">{section.summary}</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {section.lessons.map((lesson) => {
                  const state = lessonStates.get(lesson.key);
                  const locked = state?.status === "locked";
                  return (
                    <button
                      key={lesson.key}
                      type="button"
                      disabled={locked}
                      onClick={() => openLesson(lesson)}
                      className="cursor-pointer rounded border border-white/10 bg-white/[0.03] p-4 text-left transition-colors hover:border-white/22 hover:bg-white/[0.055] disabled:cursor-not-allowed disabled:opacity-35"
                    >
                      <span className="text-[10px] font-semibold tracking-[0.08em] text-white/28 uppercase">
                        {locked
                          ? "Locked"
                          : state?.status === "completed"
                            ? "Completed"
                            : "Available"}
                      </span>
                      <span className="mt-2 block text-[15px] font-semibold text-white/82">
                        {lesson.title}
                      </span>
                      <span className="mt-1 block text-[12px] leading-5 text-white/42">
                        {lesson.summary}
                      </span>
                      <span className="mt-3 block text-[11px] text-amber-200/65">
                        {state?.earnedPoints ?? 0}/{lesson.maximumPoints} points
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      ) : trainingQuery.isLoading ? (
        <div className="mt-5">
          <CasinoLoading label="Loading positions from your games…" rows={4} />
        </div>
      ) : training.length ? (
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {training.map((item) => (
            <button
              key={`${item.matchId}:${item.ply}`}
              type="button"
              onClick={() => openTraining(item)}
              className="cursor-pointer rounded border border-white/10 bg-white/[0.03] p-4 text-left transition-colors hover:border-white/22 hover:bg-white/[0.055]"
            >
              <span className="text-[10px] font-semibold tracking-[0.08em] text-red-300/65 uppercase">
                {item.classification}
              </span>
              <span className="mt-2 block text-[15px] font-semibold text-white/82">
                {item.motif}
              </span>
              <span className="mt-1 block text-[12px] text-white/42">
                {variantLabel(item.variant)} · move {item.ply}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <div className="mt-5 rounded border border-white/10 bg-white/[0.025] p-8 text-center text-[13px] text-white/42">
          Finish a rated game and request analysis. Your mistakes will become personal training
          positions here.
        </div>
      )}
    </main>
  );
}
