import { describe, expect, it } from "vitest";
import { isPersistedKey } from "@/lib/query-persist";

// The match is exact on the first key element, so a prefix that merely starts
// with a persisted one is not persisted. The screener keeps its data in
// sessionStorage (ADR-2026-09-15-meme-trending-screener), never in the
// localStorage snapshot the catalogue uses.
describe("isPersistedKey", () => {
  it("persists the memecoin catalogue", () => {
    expect(isPersistedKey(["meme", "catalog", "pages", "all"])).toBe(true);
  });

  it("does not persist the screener's list or trending data", () => {
    expect(isPersistedKey(["meme-screener", "list", "sortBy=volume&sortOrder=desc"])).toBe(false);
    expect(isPersistedKey(["meme-screener", "trending", ""])).toBe(false);
  });
});
