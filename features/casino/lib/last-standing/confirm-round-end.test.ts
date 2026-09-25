import { describe, expect, it } from "vitest";
import { resolveRoundEndConfirmation } from "./round-end";

// Between the local clock hitting zero and the winner suspense there is now a
// confirm step: the arena asks the service whether the round actually ended.
//
// The bug this closes: the suspense ran off the local clock alone, so a round
// that was still going showed "calculating the winner" and then went back to a
// running timer. The old code called that "quietly backing out"; to a player
// it reads as the game glitching at the exact moment money is decided.
describe("resolveRoundEndConfirmation", () => {
  it("waits while the service has not answered yet", () => {
    expect(
      resolveRoundEndConfirmation({ gameActive: true, countdown: 0, waitedMs: 0, maxWaitMs: 6000 })
    ).toBe("wait");
  });

  it("ends the round once the service says it is over", () => {
    expect(
      resolveRoundEndConfirmation({
        gameActive: false,
        countdown: 0,
        waitedMs: 500,
        maxWaitMs: 6000,
      })
    ).toBe("ended");
  });

  // A buzzer-beater wager put time back on the clock. The round is plainly
  // running, so the timer comes back and no winner is ever suggested.
  it("returns to the round when the clock has time on it again", () => {
    expect(
      resolveRoundEndConfirmation({
        gameActive: true,
        countdown: 12,
        waitedMs: 800,
        maxWaitMs: 6000,
      })
    ).toBe("continued");
  });

  // The service can be seconds behind, but it cannot be minutes behind. A
  // clock at zero that nobody has contradicted has ended; waiting forever
  // would leave the arena frozen at 00:00 with nothing happening at all.
  it("ends the round when the wait runs out with no contradiction", () => {
    expect(
      resolveRoundEndConfirmation({
        gameActive: true,
        countdown: 0,
        waitedMs: 6000,
        maxWaitMs: 6000,
      })
    ).toBe("ended");
  });

  // "Continued" beats the deadline: if the clock genuinely has time on it, a
  // slow answer must not turn that into a winner card.
  it("prefers a running clock over the deadline", () => {
    expect(
      resolveRoundEndConfirmation({
        gameActive: true,
        countdown: 30,
        waitedMs: 9999,
        maxWaitMs: 6000,
      })
    ).toBe("continued");
  });
});
