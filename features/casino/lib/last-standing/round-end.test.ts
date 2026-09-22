import { describe, expect, it } from "vitest";
import { shouldBeginRoundEnd } from "@/features/casino/lib/last-standing/round-end";

const live = {
  gameActive: true,
  countdown: 0,
  alreadyEnding: false,
  degraded: false,
  ownWagerPending: false,
};

describe("shouldBeginRoundEnd", () => {
  it("runs the sequence when the local clock hits zero", () => {
    expect(shouldBeginRoundEnd(live)).toBe(true);
  });

  it("waits while there is still time on the clock", () => {
    expect(shouldBeginRoundEnd({ ...live, countdown: 1 })).toBe(false);
  });

  it("does nothing for a game the server does not call active", () => {
    expect(shouldBeginRoundEnd({ ...live, gameActive: false })).toBe(false);
  });

  it("runs once per round", () => {
    expect(shouldBeginRoundEnd({ ...live, alreadyEnding: true })).toBe(false);
  });

  // A stale view cannot prove the round ended: wagers this client never heard
  // about may have extended it.
  it("holds off while the connection is behind", () => {
    expect(shouldBeginRoundEnd({ ...live, degraded: true })).toBe(false);
  });

  /**
   * The reported glitch. A wager placed at five seconds was still confirming
   * at zero, so the arena showed a winner card — then the wager landed, the
   * pot went to $0.76 and the round carried on.
   */
  it("holds off while this client's own wager is still in flight", () => {
    expect(shouldBeginRoundEnd({ ...live, ownWagerPending: true })).toBe(false);
  });

  it("runs once that wager has resolved", () => {
    expect(shouldBeginRoundEnd({ ...live, ownWagerPending: false })).toBe(true);
  });
});
