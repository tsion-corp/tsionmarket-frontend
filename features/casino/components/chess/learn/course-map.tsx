import Link from "next/link";
import { CheckIcon, LockIcon, PlayIcon } from "@/components/ui/icons";
import {
  LessonArtwork,
  LessonStars,
} from "@/features/casino/components/chess/learn/lesson-artwork";
import type {
  ChessCoachCatalog,
  ChessCoachHome,
  ChessCoachLesson,
  ChessCoachLessonState,
} from "@/features/casino/lib/api/types";
import {
  courseProgress,
  lessonRank,
  lessonStateMap,
} from "@/features/casino/lib/chess/learn-course";
import { cn } from "@/lib/utils";

function CourseSidebar({ home }: { home: ChessCoachHome }) {
  const progress = courseProgress(home.earnedPoints, home.maximumPoints);
  return (
    <aside className="overflow-hidden rounded-[7px] border border-white/10 bg-[#171715] shadow-[0_18px_55px_rgba(0,0,0,0.32)] lg:sticky lg:top-[84px]">
      <div className="flex flex-col items-center px-5 pt-7 pb-6 text-center">
        <div className="relative grid h-32 w-32 place-items-center">
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background: `conic-gradient(#80a94c ${progress * 3.6}deg, #2a2b28 0deg)`,
            }}
          />
          <div className="absolute inset-[9px] grid place-items-center rounded-full bg-[#11110f]">
            <span>
              <strong className="tnum block text-[28px] leading-none text-white">
                {progress}%
              </strong>
              <span className="mt-1 block text-[9px] font-semibold tracking-[0.12em] text-white/35 uppercase">
                complete
              </span>
            </span>
          </div>
        </div>
        <h1 className="mt-5 font-serif text-[27px] font-bold tracking-[-0.025em] text-white">
          Chess basics
        </h1>
        <p className="mt-1 text-[13px] leading-5 text-white/48">
          Learn the rules, pieces and first tactics by playing every move yourself.
        </p>
      </div>
      <div className="border-t border-white/8 px-5 py-4">
        <div className="flex items-center justify-between text-[11px] text-white/38">
          <span>Course score</span>
          <strong className="tnum text-white/70">
            {home.earnedPoints}/{home.maximumPoints}
          </strong>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/8">
          <div className="h-full rounded-full bg-[#80a94c]" style={{ width: `${progress}%` }} />
        </div>
      </div>
      <div className="grid border-t border-white/8">
        <Link
          href="/casino/chess/create"
          className="flex items-center justify-center gap-2 px-4 py-3 text-[12px] font-semibold text-white/52 transition-colors hover:bg-white/[0.04] hover:text-white"
        >
          <PlayIcon size={13} /> Play a game
        </Link>
      </div>
    </aside>
  );
}

function StageCard({
  lesson,
  state,
  recommended,
  opening,
  onOpen,
}: {
  lesson: ChessCoachLesson;
  state: ChessCoachLessonState | undefined;
  recommended: boolean;
  opening: boolean;
  onOpen: (lesson: ChessCoachLesson) => void;
}) {
  const status = state?.status ?? "locked";
  const locked = status === "locked";
  const done = status === "completed";
  const rank = lessonRank(state?.earnedPoints ?? 0, lesson.maximumPoints);

  return (
    <button
      type="button"
      disabled={locked || opening}
      onClick={() => onOpen(lesson)}
      className={cn(
        "group relative flex min-h-[100px] w-full cursor-pointer items-center overflow-hidden rounded-[7px] border pr-12 text-left shadow-[0_4px_12px_rgba(0,0,0,0.2)] transition-[transform,border-color,background-color] hover:scale-[1.018] disabled:cursor-not-allowed disabled:hover:scale-100",
        done &&
          "border-[#64843e]/70 bg-[linear-gradient(0deg,rgba(99,132,61,0.26),rgba(99,132,61,0.12))]",
        recommended &&
          !done &&
          "border-[#4d8db7]/75 bg-[linear-gradient(0deg,rgba(53,112,150,0.28),rgba(53,112,150,0.12))]",
        !recommended && !done && !locked && "border-white/14 bg-[#171715] hover:border-white/25",
        locked &&
          "border-[#493d54]/55 bg-[linear-gradient(0deg,rgba(80,55,95,0.18),rgba(38,31,42,0.18))] opacity-62"
      )}
    >
      <span className="grid w-[92px] shrink-0 place-items-center self-stretch bg-black/10">
        <LessonArtwork lesson={lesson} />
      </span>
      <span className="min-w-0 py-4 pr-3 pl-1">
        <span className="block truncate font-serif text-[20px] leading-tight font-bold text-white/92">
          {lesson.title}
        </span>
        <span className="mt-1 block text-[12px] leading-4 text-white/52">{lesson.summary}</span>
        <span className="mt-2 flex items-center gap-2">
          <LessonStars rank={rank} />
          <span className="text-[10px] text-white/30">
            {state?.completedChapters ?? 0}/{state?.totalChapters ?? lesson.chapters.length} levels
          </span>
        </span>
      </span>
      <span className="absolute top-0 right-0 grid h-full w-11 place-items-center border-l border-white/[0.055] text-white/38">
        {done ? (
          <CheckIcon size={17} className="text-[#9abb69]" />
        ) : locked ? (
          <LockIcon size={15} />
        ) : opening ? (
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white/70" />
        ) : (
          <span className="text-[20px]">›</span>
        )}
      </span>
      {recommended && !done ? (
        <span className="absolute inset-0 rounded-[7px] ring-1 ring-[#7cc5f4]/25 ring-inset" />
      ) : null}
    </button>
  );
}

export function CourseMap({
  catalog,
  home,
  openingLessonKey,
  onOpenLesson,
}: {
  catalog: ChessCoachCatalog;
  home: ChessCoachHome;
  openingLessonKey: string | null;
  onOpenLesson: (lesson: ChessCoachLesson) => void;
}) {
  const states = lessonStateMap(home.lessons);
  return (
    <main className="min-h-[calc(100svh-60px)] bg-[#0b0b0a] px-3 py-5 text-white sm:px-5 sm:py-8">
      <div className="mx-auto grid w-full max-w-[1280px] items-start gap-7 lg:grid-cols-[242px_minmax(0,1fr)]">
        <CourseSidebar home={home} />
        <div className="min-w-0">
          {catalog.sections.map((section) => (
            <section key={section.key} className="mb-10 last:mb-0">
              <div className="mb-4 text-center">
                <h2 className="text-[18px] font-semibold tracking-[0.32em] text-white/58 uppercase sm:text-[21px]">
                  {section.title}
                </h2>
                <p className="mt-1.5 text-[12px] text-white/32">{section.summary}</p>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {section.lessons.map((lesson) => (
                  <StageCard
                    key={lesson.key}
                    lesson={lesson}
                    state={states.get(lesson.key)}
                    recommended={home.recommendedLessonKey === lesson.key}
                    opening={openingLessonKey === lesson.key}
                    onOpen={onOpenLesson}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
