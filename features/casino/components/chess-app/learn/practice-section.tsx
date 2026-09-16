"use client";

import { createElement, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CasinoError, CasinoLoading } from "@/features/casino/components/casino-state";
import {
  installLichessRuntime,
  loadLichessStyle,
  type LichessPowertip,
} from "@/features/casino/components/chess-app/lichess-round";
import { LessonRunner } from "@/features/casino/components/chess-app/learn/lesson-runner";
import { useCasinoWallet } from "@/features/casino/hooks/use-casino-wallet";
import {
  fetchCoachCatalog,
  fetchCoachHome,
  updateCoachProfile,
} from "@/features/casino/lib/api/chess";
import type { ChessCoachLesson } from "@/features/casino/lib/api/types";
import {
  courseProgress,
  flattenCourse,
  lessonStateMap,
} from "@/features/casino/lib/chess/learn-course";
import { friendlyError } from "@/lib/errors";
import { toast } from "@/lib/toast";

const ROOT = "/casino/chess/learn/practice";
const PRACTICE_CSS = "/css/bits.practice.index.eb6391fe.css";
const SITE_CSS = "/css/site.5a4b7c75.css";
const THEME_CSS = "/css/lib.theme.all.ca09c987.css";

const inertPowertip: LichessPowertip = {
  watchMouse() {},
  manualUser() {},
  manualUserIn() {},
  dispose() {},
};

const LESSON_ARTWORK: Record<string, string> = {
  "core.rook": "stone-tower.svg",
  "core.bishop": "pocket-bow.svg",
  "core.knight": "trojan-horse.svg",
  "core.pawn": "push.svg",
  "core.king": "guarded-tower.svg",
  "core.queen": "upgrade.svg",
  "core.capture": "pierced-body.svg",
  "core.check": "bolt-shield.svg",
  "core.castling": "locked-fortress.svg",
  "core.promotion": "upgrade.svg",
  "tactics.hanging-piece": "skeletal-hand.svg",
  "tactics.fork": "trident.svg",
  "tactics.pin": "magnet.svg",
  "tactics.mate-one": "tower-fall.svg",
};

function installPracticeShell(): () => void {
  document.body.dataset.assetUrl = "";
  document.body.classList.add("is2d");
  installLichessRuntime(undefined, inertPowertip);
  document.body.classList.remove("fixed-scroll", "playing");
  void Promise.all([
    loadLichessStyle(THEME_CSS),
    loadLichessStyle(SITE_CSS),
    loadLichessStyle(PRACTICE_CSS),
  ]);
  return () => document.body.classList.remove("is2d");
}

export function PracticeSection({ lessonKey }: { lessonKey: string | null }) {
  const router = useRouter();
  const wallet = useCasinoWallet();
  const queryClient = useQueryClient();
  const player = wallet.address;
  const [openingLessonKey, setOpeningLessonKey] = useState<string | null>(null);

  useEffect(installPracticeShell, []);

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
  const lessons = useMemo(
    () => (catalogQuery.data ? flattenCourse(catalogQuery.data) : []),
    [catalogQuery.data]
  );
  const activeLesson = lessons.find((lesson) => lesson.key === lessonKey) ?? null;

  const openLesson = async (lesson: ChessCoachLesson) => {
    const home = homeQuery.data;
    if (!player || !home) return;
    if (lessonStateMap(home.lessons).get(lesson.key)?.status === "locked") return;
    setOpeningLessonKey(lesson.key);
    try {
      if (!home.profile.onboardingComplete) {
        await updateCoachProfile(player, {
          experience: home.profile.experience,
          onboardingComplete: true,
          preferredMode: "lessons",
        });
        await queryClient.invalidateQueries({
          queryKey: ["casino", "chess", "coach-home", player],
        });
      }
      router.push(`${ROOT}?lesson=${encodeURIComponent(lesson.key)}`);
    } catch (error) {
      toast.error(friendlyError(error, "The practice lesson could not be opened."));
    } finally {
      setOpeningLessonKey(null);
    }
  };

  if (!player || catalogQuery.isLoading || homeQuery.isLoading) {
    return (
      <div className="mx-auto min-h-[calc(100dvh-60px)] max-w-[960px] px-4 py-10">
        <CasinoLoading label="Loading chess practice" rows={6} />
      </div>
    );
  }
  if (catalogQuery.error || homeQuery.error || !catalogQuery.data || !homeQuery.data) {
    return (
      <div className="mx-auto min-h-[calc(100dvh-60px)] max-w-[960px] px-4 py-10">
        <CasinoError
          error={catalogQuery.error ?? homeQuery.error}
          subject="chess practice"
          onRetry={() => {
            void catalogQuery.refetch();
            void homeQuery.refetch();
          }}
        />
      </div>
    );
  }

  if (activeLesson) {
    return (
      <LessonRunner
        key={activeLesson.key}
        catalog={catalogQuery.data}
        home={homeQuery.data}
        lesson={activeLesson}
        player={player}
        onMenu={() => router.push(ROOT)}
        onLesson={(lesson) => router.push(`${ROOT}?lesson=${encodeURIComponent(lesson.key)}`)}
      />
    );
  }

  const states = lessonStateMap(homeQuery.data.lessons);
  const progress = courseProgress(homeQuery.data.earnedPoints, homeQuery.data.maximumPoints);

  return (
    <div id="main-wrap" style={{ marginTop: 0 }}>
      <main className="page-menu force-ltr">
        <aside className="page-menu__menu practice-side">
          <div className="practice-side__header">
            <img
              className="practice-side__decoration"
              alt="Decorative image of a robotic golem"
              src="/images/practice/robot-golem.svg"
            />
            <div className="practice-side__title">
              <h1>Practice</h1>
              <h2>makes your chess perfect</h2>
            </div>
          </div>
          <div className="progress">
            <div className="text">Progress: {progress}%</div>
            <div className="bar" style={{ width: `${progress}%` }} />
          </div>
        </aside>

        <div className="page-menu__content practice-app">
          {catalogQuery.data.sections.map((section) => (
            <section key={section.key}>
              <h2>{section.title}</h2>
              <div className="studies">
                {section.lessons.map((lesson) => {
                  const state = states.get(lesson.key);
                  const locked = state?.status === "locked";
                  const stateClass =
                    state?.status === "completed"
                      ? "done"
                      : state?.status === "inProgress" ||
                          homeQuery.data.recommendedLessonKey === lesson.key
                        ? "ongoing"
                        : "future";
                  const completed = state?.completedChapters ?? 0;
                  const total = state?.totalChapters ?? lesson.chapters.length;
                  const artwork = LESSON_ARTWORK[lesson.key] ?? "help.svg";

                  return (
                    <a
                      key={lesson.key}
                      className={`study ${stateClass}`}
                      href={`${ROOT}?lesson=${encodeURIComponent(lesson.key)}`}
                      aria-disabled={locked || openingLessonKey === lesson.key}
                      onClick={(event) => {
                        event.preventDefault();
                        if (!locked && openingLessonKey !== lesson.key) void openLesson(lesson);
                      }}
                    >
                      <span className="ribbon-wrapper">
                        <span className={`ribbon ${stateClass}`}>
                          {completed} / {total}
                        </span>
                      </span>
                      {createElement("icon", {
                        "aria-hidden": "true",
                        style: { backgroundImage: `url('/images/practice/${artwork}')` },
                      })}
                      <span className="text">
                        <h3>{lesson.title}</h3>
                        <p>{lesson.summary}</p>
                      </span>
                      {stateClass !== "done" ? <div className="attention-effect" /> : null}
                    </a>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}
