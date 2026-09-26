import { describe, expect, it } from "vitest";
import { keepKnownMetadata } from "./vault-game";

const game = (id: number, over: Record<string, unknown> = {}) => ({
  gameId: id,
  starter: "0x1",
  king: "0x2",
  pot: { amount: "1", tokenSymbol: "USDC", usdValue: 1, formattedUsd: "$1" },
  minWager: { amount: "1", tokenSymbol: "USDC", usdValue: 1, formattedUsd: "$1" },
  endTime: 1,
  timeRemaining: 1,
  settled: false,
  active: true,
  isPrivate: false,
  ...over,
});

// The keeper caches its ABI choice for the life of the process
// (ethers-chain-client-v5.ts, `privacyFieldSupported ??=`). A keeper that
// started before the v5.1 upgrade reads the legacy ten-field tuple and appends
// `false`, so EVERY socket snapshot reports isPrivate: false — including for
// games the index correctly records as private. That snapshot replaces the
// cache, which is how a private game started on one device appeared in the
// lobby on another.
//
// A snapshot may therefore be WRONG here, not merely silent, so private
// latches: once any source says private, a later frame cannot undo it. The
// wrong direction is exposure; a game wrongly kept private is still reachable
// by its link.
describe("private latches against a stale snapshot", () => {
  it("keeps a private game private when the snapshot says public", () => {
    const previous = [game(261, { isPrivate: true })];
    const incoming = [game(261, { isPrivate: false, timeRemaining: 30 })];

    const merged = keepKnownMetadata(previous, incoming);

    expect(merged[0].isPrivate).toBe(true);
    // Everything the snapshot is authoritative for still wins.
    expect(merged[0].timeRemaining).toBe(30);
  });

  it("lets a snapshot turn a public game private", () => {
    const merged = keepKnownMetadata([game(1)], [game(1, { isPrivate: true })]);
    expect(merged[0].isPrivate).toBe(true);
  });

  it("leaves a public game public", () => {
    expect(keepKnownMetadata([game(1)], [game(1)])[0].isPrivate).toBe(false);
  });

  it("does not resurrect a game the snapshot dropped", () => {
    const merged = keepKnownMetadata([game(1, { isPrivate: true })], [game(2)]);
    expect(merged.map((g) => g.gameId)).toEqual([2]);
  });
});
