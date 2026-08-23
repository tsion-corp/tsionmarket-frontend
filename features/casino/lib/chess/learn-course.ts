import type {
  ChessCoachCatalog,
  ChessCoachLesson,
  ChessCoachLessonState,
} from "@/features/casino/lib/api/types";

export function flattenCourse(catalog: ChessCoachCatalog): ChessCoachLesson[] {
  return catalog.sections.flatMap((section) => section.lessons);
}

export function lessonStateMap(
  states: readonly ChessCoachLessonState[]
): ReadonlyMap<string, ChessCoachLessonState> {
  return new Map(states.map((state) => [state.lessonKey, state]));
}

export function courseProgress(earnedPoints: number, maximumPoints: number): number {
  if (maximumPoints <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((earnedPoints / maximumPoints) * 100)));
}

export function lessonRank(earnedPoints: number, maximumPoints: number): 0 | 1 | 2 | 3 {
  if (earnedPoints <= 0 || maximumPoints <= 0) return 0;
  const ratio = earnedPoints / maximumPoints;
  if (ratio >= 0.9) return 3;
  if (ratio >= 0.7) return 2;
  return 1;
}

export function lessonAfter(
  catalog: ChessCoachCatalog,
  lessonKey: string
): ChessCoachLesson | null {
  const lessons = flattenCourse(catalog);
  const index = lessons.findIndex((lesson) => lesson.key === lessonKey);
  return index >= 0 ? (lessons[index + 1] ?? null) : null;
}
