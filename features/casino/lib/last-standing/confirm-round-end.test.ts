import { describe, expect, it } from "vitest";
import { resolveChainRoundEnd, resolveRoundEndConfirmation } from "./round-end";

// "Calculating the winner" must come after the game has ended, never before.
//
// Two ways a round can look over, and both used to open the suspense without
// checking. The local clock reaching zero is a prediction. The service
// reporting the game inactive is not much better: `active` is derived from
// endTime, so a wager landing at the buzzer leaves a window where endTime has
// passed but the extension is not indexed yet.
const SETTLE = 2000;
const DEADLINE = 6000;

const verdict = (over: Partial<Parameters<typeof resolveRoundEndConfirmation>[0]>) =>
  resolveRoundEndConfirmation({
    gameActive: false,
    countdown: 0,
    waitedMs: 0,
    maxWaitMs: DEADLINE,
    settleMs: SETTLE,
    ...over,
  });

describe("a clock with time on it", () => {
  it("beats a fresh inactive report", () => {
    expect(verdict({ gameActive: true, countdown: 47, waitedMs: 900 })).toBe("continued");
  });

  it("beats the deadline", () => {
    expect(verdict({ gameActive: true, countdown: 30, waitedMs: 99_999 })).toBe("continued");
  });
});

describe("a round reported inactive", () => {
  it("is not believed immediately", () => {
    expect(verdict({ waitedMs: 0 })).toBe("wait");
  });

  it("is believed once it has held", () => {
    expect(verdict({ waitedMs: SETTLE })).toBe("ended");
  });
});

describe("a service that has not answered", () => {
  it("waits", () => {
    expect(verdict({ gameActive: true, countdown: 0, waitedMs: 0 })).toBe("wait");
  });

  it("keeps waiting until the deadline", () => {
    expect(verdict({ gameActive: true, countdown: 0, waitedMs: DEADLINE - 1 })).toBe("wait");
  });

  // Waiting for ever would freeze the arena at 00:00, which is the dead air
  // the prediction existed to avoid.
  it("falls back to the local clock at the deadline", () => {
    expect(verdict({ gameActive: true, countdown: 0, waitedMs: DEADLINE })).toBe("ended");
  });
});

// The contract answers outright: a wager extends endTime in the transaction
// that places it, so there is nothing to wait out.
describe("the contract's own answer", () => {
  const chain = (over: Partial<Parameters<typeof resolveChainRoundEnd>[0]> = {}) =>
    resolveChainRoundEnd({
      endTime: 1_700_000_060,
      settled: false,
      chainNow: 1_700_000_000,
      ...over,
    });

  it("keeps a round whose endTime is still ahead of the block", () => {
    expect(chain()).toBe("continued");
  });

  it("ends a round whose endTime the block has passed", () => {
    expect(chain({ endTime: 1_700_000_000, chainNow: 1_700_000_001 })).toBe("ended");
  });

  it("ends a settled round whatever its endTime says", () => {
    expect(chain({ settled: true, endTime: 1_700_009_999 })).toBe("ended");
  });

  // The buzzer-beater. The service still reports the round over here, which is
  // exactly the report that named a winner on a live round.
  it("saves a round a buzzer-beater wager extended", () => {
    expect(chain({ endTime: 1_700_000_045, chainNow: 1_700_000_000 })).toBe("continued");
  });
});
