import { describe, expect, it } from "vitest";
import { chickenReports } from "@/features/casino/lib/chicken-analytics";
import type { ChickenSession, ChickenStep } from "@/features/casino/lib/api/arkjet";

function step(over: Partial<ChickenStep> & Pick<ChickenStep, "step">): ChickenStep {
  return {
    multiplierHundredths: 120,
    multiplier: "1.2",
    won: true,
    randomWon: true,
    outcomeReason: "random",
    resultHash: "h",
    randomValueHex: "0x",
    ...over,
  };
}

function session(over: Partial<ChickenSession> = {}): ChickenSession {
  return {
    sessionId: "s1",
    status: "active",
    difficulty: "medium",
    currency: "USDC",
    amount: "2",
    maximumStep: 10,
    maximumPayableStep: 10,
    liquidityCrashStep: null,
    currentStep: 0,
    attemptedSteps: 0,
    currentMultiplier: "1",
    potentialPayout: "2",
    maximumPayout: "20",
    reservedNetLiability: "0",
    payout: null,
    serverSeedCommitment: "c",
    serverSeed: null,
    clientSeed: "web",
    algorithmVersion: "1",
    rtpBasisPoints: 9700,
    version: 1,
    steps: [],
    ...over,
  } as ChickenSession;
}

describe("chickenReports", () => {
  it("reports the round it started, at its stake and difficulty", () => {
    expect(chickenReports(session())).toEqual([
      {
        key: "s1:started",
        name: "chicken_round_started",
        props: {
          round_id: "s1",
          amount_usd: 2,
          difficulty: "medium",
          ticket_type: "paid",
        },
      },
    ]);
  });

  it("reports each lane cleared, and never the one the chicken did not survive", () => {
    const reports = chickenReports(
      session({
        status: "lost",
        currentStep: 3,
        currentMultiplier: "1.8",
        steps: [
          step({ step: 1, multiplier: "1.2" }),
          step({ step: 2, multiplier: "1.8" }),
          step({ step: 3, multiplier: "2.6", won: false }),
        ],
      })
    );
    const lanes = reports.filter((r) => r.name === "chicken_lane_advanced");
    expect(lanes.map((r) => r.props)).toEqual([
      { round_id: "s1", lane_index: 1, multiplier: 1.2 },
      { round_id: "s1", lane_index: 2, multiplier: 1.8 },
    ]);
    expect(reports.at(-1)).toEqual({
      key: "s1:settled",
      name: "chicken_round_lost",
      props: { round_id: "s1", lane_index: 3, multiplier: 1.8, amount_usd: 2 },
    });
  });

  it("reports a cash-out at the lane it stopped on, with its payout", () => {
    const reports = chickenReports(
      session({
        status: "cashed_out",
        currentStep: 2,
        currentMultiplier: "1.8",
        payout: "3.6",
        steps: [step({ step: 1 }), step({ step: 2, multiplier: "1.8" })],
      })
    );
    expect(reports.at(-1)).toEqual({
      key: "s1:settled",
      name: "chicken_cashed_out",
      props: {
        round_id: "s1",
        lane_index: 2,
        multiplier: 1.8,
        amount_usd: 2,
        payout_usd: 3.6,
      },
    });
  });

  it("gives every report a stable key, so a resent session repeats nothing", () => {
    // The session is cumulative and arrives again on every socket frame and
    // every resync. The keys are what stop one lane becoming five.
    const played = session({ currentStep: 1, steps: [step({ step: 1 })] });
    const first = chickenReports(played).map((r) => r.key);
    const again = chickenReports(played).map((r) => r.key);
    expect(again).toEqual(first);
    expect(new Set(first).size).toBe(first.length);
  });
});
