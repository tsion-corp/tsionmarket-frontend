"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { useQueryClient } from "@tanstack/react-query";
import { BulbIcon, CheckIcon, ChevronLeftIcon, LockIcon } from "@/components/ui/icons";
import { ChessBoard } from "@/features/casino/components/chess/chess-board";
import {
  LessonArtwork,
  LessonStars,
} from "@/features/casino/components/chess/learn/lesson-artwork";
import { StageDialog } from "@/features/casino/components/chess/learn/stage-dialog";
import { attemptCoachLesson } from "@/features/casino/lib/api/chess";
import { newChessIdempotencyKey } from "@/features/casino/lib/api/chess-idempotency";
import type {
  ChessCoachCatalog,
  ChessCoachHome,
  ChessCoachLesson,
  ChessCoachLessonState,
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
import { lessonAfter, lessonRank, lessonStateMap } from "@/features/casino/lib/chess/learn-course";
import { friendlyError } from "@/lib/errors";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

const LEARN_THEME = BOARD_THEMES.find((theme) => theme.id === "green") ?? DEFAULT_THEME;

function CourseRail({
  catalog,
  home,
  activeLesson,
  onMenu,
  onLesson,
}: {
  catalog: ChessCoachCatalog;
  home: ChessCoachHome;
  activeLesson: ChessCoachLesson;
  onMenu: () => void;
  onLesson: (lesson: ChessCoachLesson) => void;
}) {
  const activeSection = Math.max(
    0,
    catalog.sections.findIndex((section) =>
      section.lessons.some((lesson) => lesson.key === activeLesson.key)
    )
  );
  const [expandedSection, setExpandedSection] = useState(activeSection);
  const states = lessonStateMap(home.lessons);

  return (
    <aside className="overflow-hidden rounded-[7px] border border-white/10 bg-[#171715]">
      <button
        type="button"
        onClick={onMenu}
        className="flex h-[52px] w-full cursor-pointer items-center text-left text-[14px] font-semibold text-white/70 transition-colors hover:bg-white/[0.05] hover:text-white"
      >
        <span className="grid h-[52px] w-[52px] place-items-center bg-[#777]">
          <Image src="/chess/learn/brutal-helm.svg" alt="" width={34} height={34} />
        </span>
        <span className="flex items-center gap-2 px-3">
          <ChevronLeftIcon size={13} /> Menu
        </span>
      </button>
      {catalog.sections.map((section, sectionIndex) => {
        const expanded = expandedSection === sectionIndex;
        return (
          <div key={section.key} className="border-t border-white/9">
            <button
              type="button"
              onClick={() => setExpandedSection(sectionIndex)}
              className={cn(
                "h-[50px] w-full cursor-pointer px-4 text-left text-[13px] font-semibold transition-colors",
                expanded ? "bg-[#3d86b2] text-white" : "text-white/62 hover:bg-white/[0.045]"
              )}
            >
              {section.title}
            </button>
            {expanded ? (
              <div>
                {section.lessons.map((lesson) => {
                  const state = states.get(lesson.key);
                  const locked = state?.status === "locked";
                  const done = state?.status === "completed";
                  const active = lesson.key === activeLesson.key;
                  return (
                    <button
                      key={lesson.key}
                      type="button"
                      disabled={locked}
                      onClick={() => onLesson(lesson)}
                      className={cn(
                        "flex min-h-[50px] w-full cursor-pointer items-center text-left text-[12px] transition-colors disabled:cursor-not-allowed",
                        active && "bg-[#3d86b2]/22",
                        !active && done && "hover:bg-[#789f4b]/14",
                        !active && !done && "hover:bg-white/[0.04]",
                        locked && "opacity-42"
                      )}
                    >
                      <span
                        className={cn(
                          "grid h-[50px] w-[50px] shrink-0 place-items-center",
                          active ? "bg-[#3d86b2]" : done ? "bg-[#789f4b]" : "bg-[#4f4770]"
                        )}
                      >
                        <LessonArtwork lesson={lesson} className="h-9 w-9" />
                      </span>
                      <span className="min-w-0 flex-1 truncate px-3 text-white/72">
                        {lesson.title}
                      </span>
                      <span className="pr-3 text-white/36">
                        {locked ? <LockIcon size={12} /> : done ? <CheckIcon size={13} /> : null}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        );
      })}
    </aside>
  );
}

function LessonTable({
  lesson,
  state,
  chapterIndex,
  feedback,
  attempts,
  hintStep,
  checking,
  complete,
  wrong,
  score,
  onHint,
  onRestart,
  onContinue,
}: {
  lesson: ChessCoachLesson;
  state: ChessCoachLessonState | undefined;
  chapterIndex: number;
  feedback: string;
  attempts: number;
  hintStep: number;
  checking: boolean;
  complete: boolean;
  wrong: boolean;
  score: number;
  onHint: () => void;
  onRestart: () => void;
  onContinue: () => void;
}) {
  const chapter = lesson.chapters[chapterIndex];
  return (
    <aside className="self-center overflow-hidden rounded-[7px] border border-white/10 bg-[#171715] shadow-[0_18px_55px_rgba(0,0,0,0.32)]">
      <div className="flex min-h-[90px] items-center bg-[#3d86b2] px-3 text-white">
        <LessonArtwork lesson={lesson} className="h-20 w-20" />
        <div className="min-w-0 pl-1">
          <h1 className="truncate font-serif text-[24px] leading-tight font-bold">
            {lesson.title}
          </h1>
          <p className="mt-1 text-[12px] text-white/75">{lesson.summary}</p>
        </div>
      </div>

      <div
        className={cn(
          "grid min-h-[142px] place-items-center border-t border-white/8 px-5 py-5 text-center transition-colors",
          complete && "cursor-pointer bg-[#729a45] text-white hover:bg-[#7fa74f]",
          wrong && !complete && "bg-[#7f3d39]/70",
          !complete && !wrong && "bg-[#11110f]"
        )}
        onClick={complete ? onContinue : undefined}
      >
        {complete ? (
          <div>
            <h2 className="font-serif text-[23px] font-bold">Excellent!</h2>
            <div className="mt-2">
              <LessonStars rank={lessonRank(score, 100)} />
            </div>
            <button
              type="button"
              className="mt-4 cursor-pointer rounded-[5px] bg-white px-4 py-1.5 text-[12px] font-bold text-[#55782e] shadow-[0_0_10px_rgba(255,255,255,0.34)]"
            >
              Continue
            </button>
          </div>
        ) : (
          <div>
            <p className="text-[14px] leading-6 text-white/78">{feedback}</p>
            <p className="mt-3 text-[9px] font-semibold tracking-[0.12em] text-white/35 uppercase">
              {checking ? "Checking move" : `Attempt ${Math.max(1, attempts + 1)}`}
            </p>
          </div>
        )}
      </div>

      {!complete ? (
        <div className="flex border-t border-white/8">
          <button
            type="button"
            onClick={onHint}
            disabled={checking}
            className="flex h-11 flex-1 cursor-pointer items-center justify-center gap-2 border-r border-white/8 text-[11px] font-semibold text-white/55 transition-colors hover:bg-white/[0.045] hover:text-white disabled:opacity-40"
          >
            <BulbIcon size={14} /> {hintStep >= 3 ? "Move shown" : "Hint"}
          </button>
          <button
            type="button"
            onClick={onRestart}
            disabled={checking}
            className="h-11 flex-1 cursor-pointer text-[11px] font-semibold text-white/55 transition-colors hover:bg-white/[0.045] hover:text-white disabled:opacity-40"
          >
            Restart
          </button>
        </div>
      ) : null}

      <div className="flex border-t border-white/8">
        {lesson.chapters.map((item, index) => {
          const done =
            index < (state?.completedChapters ?? 0) || (complete && index === chapterIndex);
          const active = index === chapterIndex;
          return (
            <span
              key={item.key}
              className={cn(
                "grid h-11 flex-1 place-items-center border-l border-white/8 text-[11px] first:border-l-0",
                active && !done && "bg-[#3d86b2] text-white",
                done && "bg-[#729a45] text-white",
                !active && !done && "bg-[#20201e] text-white/38"
              )}
            >
              {done ? <CheckIcon size={13} /> : index + 1}
            </span>
          );
        })}
      </div>
      <div className="border-t border-white/7 px-4 py-2 text-center text-[10px] text-white/28">
        Level {chapterIndex + 1} of {lesson.chapters.length}: {chapter?.title}
      </div>
    </aside>
  );
}

export function LessonRunner({
  catalog,
  home,
  lesson,
  player,
  onMenu,
  onLesson,
}: {
  catalog: ChessCoachCatalog;
  home: ChessCoachHome;
  lesson: ChessCoachLesson;
  player: string;
  onMenu: () => void;
  onLesson: (lesson: ChessCoachLesson) => void;
}) {
  const queryClient = useQueryClient();
  const states = lessonStateMap(home.lessons);
  const lessonState = states.get(lesson.key);
  const nextLesson = lessonAfter(catalog, lesson.key);
  const [chapterIndex, setChapterIndex] = useState(0);
  const chapter = lesson.chapters[chapterIndex];
  const [fen, setFen] = useState(chapter?.fen ?? "8/8/8/8/8/8/8/8 w - - 0 1");
  const [selected, setSelected] = useState<Square | null>(null);
  const [feedback, setFeedback] = useState(chapter?.instruction ?? "Make the move.");
  const [attempts, setAttempts] = useState(0);
  const [hintStep, setHintStep] = useState(0);
  const [checking, setChecking] = useState(false);
  const [complete, setComplete] = useState(false);
  const [wrong, setWrong] = useState(false);
  const [score, setScore] = useState(0);
  const [introOpen, setIntroOpen] = useState(true);
  const [stageComplete, setStageComplete] = useState(false);

  const position = useMemo(() => parseFen(fen), [fen]);
  const expectedMove = chapter ? fromUci(chapter.targetUci) : null;
  const showSolution = hintStep >= 3 && !!expectedMove;
  const legalTargets = useMemo(() => {
    if (showSolution && expectedMove) return [expectedMove.to];
    if (!selected || complete || checking) return [];
    return legalMovesForSquare(position, selected.r, selected.c).map((move) => move.to);
  }, [checking, complete, expectedMove, position, selected, showSolution]);

  if (!chapter) {
    return (
      <div className="grid min-h-[calc(100svh-60px)] place-items-center bg-[#0b0b0a] text-white/60">
        This lesson has no playable levels.
      </div>
    );
  }

  const resetLevel = (index = chapterIndex) => {
    const nextChapter = lesson.chapters[index];
    if (!nextChapter) return;
    setFen(nextChapter.fen);
    setSelected(null);
    setFeedback(nextChapter.instruction);
    setAttempts(0);
    setHintStep(0);
    setChecking(false);
    setComplete(false);
    setWrong(false);
    setScore(0);
  };

  const submitAttempt = async (uci: string) => {
    if (checking || complete) return;
    setChecking(true);
    setWrong(false);
    try {
      const result = await attemptCoachLesson(
        lesson.key,
        chapter.key,
        player,
        uci,
        newChessIdempotencyKey()
      );
      setAttempts(result.attempts);
      setFeedback(result.correct ? result.message : (result.nextHint ?? result.message));
      if (!result.correct) {
        setWrong(true);
        return;
      }
      const nextPosition = applyUciToFen(chapter.fen, uci);
      if (!nextPosition) throw new Error("The accepted lesson move could not be applied.");
      setFen(nextPosition.fen);
      setScore(result.bestScore || result.score);
      setComplete(true);
      await queryClient.invalidateQueries({
        queryKey: ["casino", "chess", "coach-home", player],
      });
    } catch (error) {
      toast.error(friendlyError(error, "The lesson could not check that move."));
    } finally {
      setChecking(false);
    }
  };

  const tryMove = (from: Square, to: Square) => {
    if (checking || complete || introOpen || stageComplete) return;
    const legal = legalMovesForSquare(position, from.r, from.c).some(
      (move) => move.to.r === to.r && move.to.c === to.c
    );
    if (!legal) {
      setSelected(position.board[to.r]?.[to.c]?.color === position.turn ? to : from);
      setFeedback(`${squareName(to.r, to.c)} is not a legal destination.`);
      setWrong(true);
      return;
    }
    const promotion = chapter.targetUci[4];
    const uci = toUci(
      position,
      from,
      to,
      promotion === "q" || promotion === "r" || promotion === "b" || promotion === "n"
        ? promotion
        : undefined
    );
    setSelected(null);
    void submitAttempt(uci);
  };

  const onSquareClick = (r: number, c: number) => {
    if (checking || complete || introOpen || stageComplete) return;
    const square = { r, c };
    const piece = position.board[r]?.[c];
    if (!selected) {
      if (piece?.color === position.turn) {
        setSelected(square);
        setWrong(false);
      }
      return;
    }
    if (piece?.color === position.turn) {
      setSelected(square);
      setWrong(false);
      return;
    }
    tryMove(selected, square);
  };

  const onHint = () => {
    const next = Math.min(3, hintStep + 1);
    setHintStep(next);
    setWrong(false);
    const hint = chapter.hints[next - 1];
    if (hint) setFeedback(hint);
    else if (expectedMove) {
      setSelected(expectedMove.from);
      setFeedback("The starting square and destination are highlighted.");
    }
  };

  const onContinue = () => {
    const nextIndex = chapterIndex + 1;
    if (lesson.chapters[nextIndex]) {
      setChapterIndex(nextIndex);
      resetLevel(nextIndex);
      return;
    }
    setStageComplete(true);
  };

  return (
    <main className="min-h-[calc(100svh-60px)] bg-[#0b0b0a] px-3 py-4 text-white sm:px-5 lg:py-7">
      <div className="mx-auto grid w-full max-w-[1360px] items-start gap-4 lg:grid-cols-[minmax(0,680px)_minmax(270px,340px)] xl:grid-cols-[220px_minmax(0,680px)_minmax(270px,340px)]">
        <div className="hidden xl:block">
          <CourseRail
            catalog={catalog}
            home={home}
            activeLesson={lesson}
            onMenu={onMenu}
            onLesson={onLesson}
          />
        </div>
        <div className="relative mx-auto aspect-square w-full max-w-[680px] overflow-hidden rounded-[6px] shadow-[0_24px_70px_rgba(0,0,0,0.45)]">
          <ChessBoard
            board={position.board}
            selected={showSolution && expectedMove ? expectedMove.from : selected}
            legalTargets={legalTargets}
            orientation={chapter.side === "black" ? "b" : "w"}
            theme={LEARN_THEME}
            onSquareClick={onSquareClick}
            onSquareDrop={tryMove}
          />
          {introOpen ? (
            <StageDialog
              mode="intro"
              lesson={lesson}
              score={0}
              rank={0}
              nextLessonTitle={null}
              onPrimary={() => setIntroOpen(false)}
              onMenu={onMenu}
            />
          ) : null}
          {stageComplete ? (
            <StageDialog
              mode="complete"
              lesson={lesson}
              score={score}
              rank={lessonRank(score, 100)}
              nextLessonTitle={nextLesson?.title ?? null}
              onPrimary={() => (nextLesson ? onLesson(nextLesson) : onMenu())}
              onMenu={onMenu}
            />
          ) : null}
        </div>
        <LessonTable
          lesson={lesson}
          state={lessonState}
          chapterIndex={chapterIndex}
          feedback={feedback}
          attempts={attempts}
          hintStep={hintStep}
          checking={checking}
          complete={complete}
          wrong={wrong}
          score={score}
          onHint={onHint}
          onRestart={() => resetLevel()}
          onContinue={onContinue}
        />
      </div>
      <button
        type="button"
        onClick={onMenu}
        className="mx-auto mt-4 flex cursor-pointer items-center gap-2 text-[11px] text-white/38 hover:text-white xl:hidden"
      >
        <ChevronLeftIcon size={12} /> Course menu
      </button>
    </main>
  );
}
