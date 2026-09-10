import { describe, expect, it } from "vitest";
import { chessMatchRefetchMs } from "@/features/casino/hooks/use-casino-chess";

describe("chess match polling", () => {
  it("keeps waiting games polling so an opponent join shows up quickly", () => {
    expect(chessMatchRefetchMs("awaiting_opponent", false)).toBe(1000);
    expect(chessMatchRefetchMs("awaiting_opponent", true)).toBe(1000);
  });

  it("slows only once an active game has a live socket feed", () => {
    expect(chessMatchRefetchMs("in_progress", false)).toBe(1000);
    expect(chessMatchRefetchMs("in_progress", true)).toBe(5000);
  });

  it("stops polling once the game is over", () => {
    expect(chessMatchRefetchMs("settled", false)).toBe(false);
    expect(chessMatchRefetchMs("cancelled", true)).toBe(false);
  });
});
