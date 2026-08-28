import { describe, expect, it } from "vitest";
import { distinctByAuthor } from "@/lib/square/distinct-authors";

const post = (id: string, author?: string) => ({ id, author });
const authorOf = (p: { author?: string }) => p.author;

describe("distinctByAuthor", () => {
  it("keeps one post per author, newest first", () => {
    const items = [
      post("1", "amina"),
      post("2", "amina"),
      post("3", "bode"),
      post("4", "chidi"),
      post("5", "bode"),
    ];
    expect(distinctByAuthor(items, authorOf).map((p) => p.id)).toEqual(["1", "3", "4"]);
  });

  // A repetitive rail beats a nearly-empty one: on a quiet deployment almost
  // everything can be by one person.
  it("falls back to the full list when too few authors are distinct", () => {
    const items = [post("1", "amina"), post("2", "amina"), post("3", "amina")];
    expect(distinctByAuthor(items, authorOf)).toHaveLength(3);
  });

  it("drops items with no author rather than grouping them together", () => {
    const items = [post("1"), post("2", "a"), post("3", "b"), post("4", "c")];
    expect(distinctByAuthor(items, authorOf).map((p) => p.id)).toEqual(["2", "3", "4"]);
  });

  it("handles an empty list", () => {
    expect(distinctByAuthor([], authorOf)).toEqual([]);
  });
});
