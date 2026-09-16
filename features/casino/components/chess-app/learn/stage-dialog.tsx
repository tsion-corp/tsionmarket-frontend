import {
  LessonArtwork,
  LessonStars,
} from "@/features/casino/components/chess/learn/lesson-artwork";
import type { ChessCoachLesson } from "@/features/casino/lib/api/types";

export function StageDialog({
  mode,
  lesson,
  score,
  rank,
  nextLessonTitle,
  onPrimary,
  onMenu,
}: {
  mode: "intro" | "complete";
  lesson: ChessCoachLesson;
  score: number;
  rank: 0 | 1 | 2 | 3;
  nextLessonTitle: string | null;
  onPrimary: () => void;
  onMenu: () => void;
}) {
  const complete = mode === "complete";
  return (
    <div className="absolute inset-0 z-30 grid cursor-default place-items-center bg-black/70 p-4 backdrop-blur-[2px]">
      <div className="w-full max-w-[360px] overflow-hidden rounded-[8px] border border-white/12 bg-[#171715] text-center shadow-[0_30px_90px_rgba(0,0,0,0.7)]">
        <div className="px-7 pt-7">
          {complete ? (
            <div className="mb-4 flex justify-center">
              <LessonStars rank={rank} large />
            </div>
          ) : (
            <LessonArtwork lesson={lesson} className="mx-auto h-28 w-28" />
          )}
          <h1 className="mt-3 font-serif text-[25px] leading-tight font-bold text-white">
            {complete ? `${lesson.title} complete` : lesson.title}
          </h1>
          {complete ? (
            <div className="tnum mt-2 text-[11px] font-semibold tracking-[0.12em] text-[#d6b75c] uppercase">
              Your score: {score}
            </div>
          ) : null}
          <p className="mt-3 text-[13px] leading-5 text-white/55">
            {complete
              ? `You completed every level in ${lesson.title}.`
              : `${lesson.summary} Complete each position directly on the board.`}
          </p>
        </div>
        <div className="mt-6 grid gap-2 px-7 pb-7">
          <button
            type="button"
            onClick={onPrimary}
            className="h-12 cursor-pointer rounded-[6px] bg-[#3d86b2] px-4 text-[13px] font-bold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18)] transition-colors hover:bg-[#4a96c3]"
          >
            {complete
              ? nextLessonTitle
                ? `Next: ${nextLessonTitle}`
                : "Back to course"
              : "Let's go"}
          </button>
          {complete ? (
            <button
              type="button"
              onClick={onMenu}
              className="h-11 cursor-pointer rounded-[6px] border border-white/12 text-[12px] font-semibold text-white/55 transition-colors hover:bg-white/[0.04] hover:text-white"
            >
              Course menu
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
