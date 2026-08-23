import { describe, expect, it } from "vitest";
import {
  courseProgress,
  flattenCourse,
  lessonAfter,
  lessonRank,
  lessonStateMap,
} from "@/features/casino/lib/chess/learn-course";
import type { ChessCoachCatalog, ChessCoachLessonState } from "@/features/casino/lib/api/types";

const catalog: ChessCoachCatalog = {
  version: 1,
  maximumPoints: 200,
  sections: [
    {
      key: "pieces",
      title: "Pieces",
      summary: "Basics",
      lessons: [
        {
          key: "rook",
          title: "Rook",
          summary: "Lines",
          difficulty: 1,
          maximumPoints: 100,
          prerequisiteLessonKeys: [],
          chapters: [],
        },
        {
          key: "bishop",
          title: "Bishop",
          summary: "Diagonals",
          difficulty: 1,
          maximumPoints: 100,
          prerequisiteLessonKeys: ["rook"],
          chapters: [],
        },
      ],
    },
  ],
};

describe("learn course helpers", () => {
  it("preserves course order and finds the next lesson", () => {
    expect(flattenCourse(catalog).map((lesson) => lesson.key)).toEqual(["rook", "bishop"]);
    expect(lessonAfter(catalog, "rook")?.key).toBe("bishop");
    expect(lessonAfter(catalog, "bishop")).toBeNull();
  });

  it("normalizes progress and ranks completed work", () => {
    expect(courseProgress(75, 200)).toBe(38);
    expect(courseProgress(300, 200)).toBe(100);
    expect(lessonRank(0, 100)).toBe(0);
    expect(lessonRank(60, 100)).toBe(1);
    expect(lessonRank(70, 100)).toBe(2);
    expect(lessonRank(90, 100)).toBe(3);
  });

  it("indexes server lesson state by lesson key", () => {
    const states: ChessCoachLessonState[] = [
      {
        lessonKey: "rook",
        status: "completed",
        earnedPoints: 92,
        maximumPoints: 100,
        completedChapters: 1,
        totalChapters: 1,
      },
    ];
    expect(lessonStateMap(states).get("rook")).toEqual(states[0]);
  });
});
