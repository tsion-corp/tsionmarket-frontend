import { describe, expect, it } from "vitest";
import {
  applyCommentLike,
  expanderLabel,
  groupThread,
  threadOf,
} from "@/lib/square/comment-thread";

// The Square's thread shaping, carried over: top-level comments newest
// first, each with the replies the page already holds oldest first.
describe("groupThread", () => {
  const c = (id: string, parentId: string | null, at: string) => ({
    id,
    parentId,
    createdAt: at,
    replyCount: 0,
    likeCount: 0,
  });

  it("nests replies under their parent and orders roots newest first", () => {
    const threads = groupThread([
      c("a", null, "2026-09-10T00:00:00Z"),
      c("b", null, "2026-09-12T00:00:00Z"),
      c("a2", "a", "2026-09-11T00:00:00Z"),
      c("a1", "a", "2026-09-10T01:00:00Z"),
    ]);
    expect(threads.map((thread) => thread.comment.id)).toEqual(["b", "a"]);
    expect(threads[1].replies.map((reply) => reply.id)).toEqual(["a1", "a2"]);
  });

  it("treats a reply whose parent is not loaded as a root", () => {
    expect(groupThread([c("x", "gone", "2026-09-12T00:00:00Z")])[0].comment.id).toBe("x");
  });
});

describe("threadOf and the expander", () => {
  it("names the thread by the root", () => {
    expect(threadOf({ id: "r", parentId: null })).toBe("r");
    expect(threadOf({ id: "x", parentId: "r" })).toBe("r");
  });

  it("says how many replies are left to view", () => {
    expect(expanderLabel(3, 0, false)).toEqual({ kind: "view", count: 3, more: false });
    expect(expanderLabel(3, 1, false)).toEqual({ kind: "view", count: 2, more: true });
    expect(expanderLabel(1, 1, false)).toBeNull();
    expect(expanderLabel(3, 2, true)).toEqual({ kind: "hide" });
    expect(expanderLabel(3, 0, true)).toBeNull();
  });
});

describe("applyCommentLike", () => {
  it("moves the count with the heart and never below zero", () => {
    const base = { id: "c", parentId: null, createdAt: "", replyCount: 0, likeCount: 0 };
    expect(applyCommentLike(base, true)).toMatchObject({ likedByMe: true, likeCount: 1 });
    expect(applyCommentLike({ ...base, likedByMe: true, likeCount: 0 }, false)).toMatchObject({
      likedByMe: false,
      likeCount: 0,
    });
    const already = { ...base, likedByMe: true };
    expect(applyCommentLike(already, true)).toBe(already);
  });
});
