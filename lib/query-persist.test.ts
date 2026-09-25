import { describe, expect, it } from "vitest";
import { isPersistedKey } from "@/lib/query-persist";

// The match is exact on the first key element, so a prefix that merely starts
// with a persisted one is not persisted. The screener keeps its data in
// sessionStorage (ADR-2026-09-15-meme-trending-screener), never in the
// localStorage snapshot.
describe("isPersistedKey", () => {
  // Both are cached for a long time in memory now: the catalogue for the life
  // of the tab, trending for ten minutes. A snapshot on disk would be restored
  // into that window on a reload and then not refetched, so a reload would
  // paint the last visit's coins. Keeping them out of the snapshot is what
  // makes a reload a real read.
  it("does not persist the memecoin catalogue or trending", () => {
    expect(isPersistedKey(["meme", "catalog", "pages", "all"])).toBe(false);
    expect(isPersistedKey(["meme", "catalog", 1, 10, "base"])).toBe(false);
    expect(isPersistedKey(["meme", "trending"])).toBe(false);
  });

  it("still persists the other memecoin reads", () => {
    expect(isPersistedKey(["meme", "token", 8453, "0xabc"])).toBe(true);
    expect(isPersistedKey(["meme", "search", "doge"])).toBe(true);
  });

  it("does not persist the screener's list or trending data", () => {
    expect(isPersistedKey(["meme-screener", "list", "sortBy=volume&sortOrder=desc"])).toBe(false);
    expect(isPersistedKey(["meme-screener", "trending", ""])).toBe(false);
  });

  it("leaves every other prefix as it was", () => {
    expect(isPersistedKey(["portfolio", "balances"])).toBe(true);
    expect(isPersistedKey(["prices", "usd"])).toBe(true);
    expect(isPersistedKey(["deposit-status", "0xabc"])).toBe(false);
  });
});
