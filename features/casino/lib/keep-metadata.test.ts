import { describe, expect, it } from "vitest";
import { keepKnownMetadata } from "./vault-game";
import type { VaultGame } from "./vault-api";

const game = (over: Partial<VaultGame> = {}): VaultGame => ({
  gameId: 256,
  starter: "0x1",
  king: "0x2",
  pot: { amount: "1", tokenSymbol: "USDC", usdValue: 1, formattedUsd: "$1" },
  minWager: { amount: "1", tokenSymbol: "USDC", usdValue: 1, formattedUsd: "$1" },
  endTime: 100,
  timeRemaining: 50,
  settled: false,
  active: true,
  ...over,
});

// The keeper builds its lobby snapshot with toGameDto(game, usd) — two
// arguments, where the third is metadata — so a socket frame never carries a
// name. The snapshot replaces the cache wholesale, which wiped the title a
// second after REST had loaded it.
describe("keepKnownMetadata", () => {
  it("carries a known name onto a socket row that has none", () => {
    const previous = [game({ title: "TGIF", description: "Testing" })];
    const incoming = [game({ timeRemaining: 30 })];

    const merged = keepKnownMetadata(previous, incoming);

    expect(merged[0].title).toBe("TGIF");
    expect(merged[0].description).toBe("Testing");
    // The snapshot is still authoritative for everything it does carry.
    expect(merged[0].timeRemaining).toBe(30);
  });

  it("prefers a name the snapshot does carry, when it carries one", () => {
    const previous = [game({ title: "old" })];
    const incoming = [game({ title: "new" })];
    expect(keepKnownMetadata(previous, incoming)[0].title).toBe("new");
  });

  // The snapshot decides which games exist: one missing from it has settled or
  // gone away, and must not be resurrected by this.
  it("adds no game the snapshot left out", () => {
    const previous = [game({ gameId: 1, title: "gone" }), game({ gameId: 2 })];
    const incoming = [game({ gameId: 2 })];
    const merged = keepKnownMetadata(previous, incoming);
    expect(merged.map((g) => g.gameId)).toEqual([2]);
  });

  it("leaves a game nobody has a name for alone", () => {
    const merged = keepKnownMetadata([game({ gameId: 9 })], [game({ gameId: 256 })]);
    expect(merged[0].title).toBeUndefined();
  });

  it("handles an empty previous cache, which is the first snapshot", () => {
    expect(keepKnownMetadata([], [game()])).toHaveLength(1);
  });

  it("handles an empty snapshot, which is an empty lobby", () => {
    expect(keepKnownMetadata([game({ title: "x" })], [])).toEqual([]);
  });
});
