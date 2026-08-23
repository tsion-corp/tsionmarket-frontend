"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CasinoError, CasinoLoading } from "@/features/casino/components/casino-state";
import { CourseMap } from "@/features/casino/components/chess/learn/course-map";
import { LessonRunner } from "@/features/casino/components/chess/learn/lesson-runner";
import { useCasinoWallet } from "@/features/casino/hooks/use-casino-wallet";
import {
  fetchCoachCatalog,
  fetchCoachHome,
  updateCoachProfile,
} from "@/features/casino/lib/api/chess";
import type { ChessCoachLesson } from "@/features/casino/lib/api/types";
import { flattenCourse, lessonStateMap } from "@/features/casino/lib/chess/learn-course";
import { friendlyError } from "@/lib/errors";
import { toast } from "@/lib/toast";

export function LearnSection() {
  const wallet = useCasinoWallet();
  const queryClient = useQueryClient();
  const player = wallet.address;
  const [activeLessonKey, setActiveLessonKey] = useState<string | null>(null);
  const [openingLessonKey, setOpeningLessonKey] = useState<string | null>(null);

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

  const catalog = catalogQuery.data;
  const home = homeQuery.data;
  const lessons = useMemo(() => (catalog ? flattenCourse(catalog) : []), [catalog]);
  const activeLesson = lessons.find((lesson) => lesson.key === activeLessonKey) ?? null;

  const openFromMap = async (lesson: ChessCoachLesson) => {
    if (!player || !home) return;
    const state = lessonStateMap(home.lessons).get(lesson.key);
    if (state?.status === "locked") return;
    setOpeningLessonKey(lesson.key);
    try {
      if (!home.profile.onboardingComplete) {
        await updateCoachProfile(player, {
          experience: home.profile.experience,
          onboardingComplete: true,
          preferredMode: "learn",
        });
        await queryClient.invalidateQueries({
          queryKey: ["casino", "chess", "coach-home", player],
        });
      }
      setActiveLessonKey(lesson.key);
    } catch (error) {
      toast.error(friendlyError(error, "The course could not start this lesson."));
    } finally {
      setOpeningLessonKey(null);
    }
  };

  if (!player) {
    return (
      <main className="grid min-h-[calc(100svh-60px)] place-items-center bg-[#0b0b0a] px-5 text-center text-white">
        <div className="max-w-[460px]">
          <Image
            src="/chess/learn/brutal-helm.svg"
            alt=""
            width={128}
            height={128}
            className="mx-auto opacity-70 grayscale"
          />
          <h1 className="mt-5 font-serif text-[30px] font-bold">Sign in to learn chess</h1>
          <p className="mt-2 text-[13px] leading-6 text-white/48">
            Your course score and completed levels are saved to your account.
          </p>
        </div>
      </main>
    );
  }

  if (catalogQuery.isLoading || homeQuery.isLoading || !catalog || !home) {
    return (
      <div className="min-h-[calc(100svh-60px)] bg-[#0b0b0a] px-4 py-10">
        <div className="mx-auto max-w-[900px]">
          <CasinoLoading label="Preparing chess lessons" rows={6} />
        </div>
      </div>
    );
  }

  if (catalogQuery.error || homeQuery.error) {
    return (
      <div className="min-h-[calc(100svh-60px)] bg-[#0b0b0a] px-4 py-10">
        <div className="mx-auto max-w-[900px]">
          <CasinoError
            error={catalogQuery.error ?? homeQuery.error}
            subject="chess lessons"
            onRetry={() => {
              void catalogQuery.refetch();
              void homeQuery.refetch();
            }}
          />
        </div>
      </div>
    );
  }

  if (activeLesson) {
    return (
      <LessonRunner
        key={activeLesson.key}
        catalog={catalog}
        home={home}
        lesson={activeLesson}
        player={player}
        onMenu={() => setActiveLessonKey(null)}
        onLesson={(lesson) => setActiveLessonKey(lesson.key)}
      />
    );
  }

  return (
    <CourseMap
      catalog={catalog}
      home={home}
      openingLessonKey={openingLessonKey}
      onOpenLesson={(lesson) => void openFromMap(lesson)}
    />
  );
}
