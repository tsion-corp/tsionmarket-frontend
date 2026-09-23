// What Pilot Chicken reports about a round.
//
// Every update to a session arrives through one place in the hook, whether it
// came from a mutation or from the socket, so the whole round is described from
// the session itself rather than from the handful of actions that move it.
//
// The session is cumulative: it carries every lane crossed so far, not just the
// newest. So this returns everything true of the round, each with a key, and
// the caller drops what it has already sent. That way a resynchronised session,
// or the same frame arriving twice, cannot report a lane twice.

import type { AnalyticsEvents } from "@/lib/analytics/events";
import type { ChickenSession } from "@/features/casino/lib/api/arkjet";

export type ChickenReport =
  | { key: string; name: "chicken_round_started"; props: AnalyticsEvents["chicken_round_started"] }
  | { key: string; name: "chicken_lane_advanced"; props: AnalyticsEvents["chicken_lane_advanced"] }
  | { key: string; name: "chicken_cashed_out"; props: AnalyticsEvents["chicken_cashed_out"] }
  | { key: string; name: "chicken_round_lost"; props: AnalyticsEvents["chicken_round_lost"] };

function num(value: string | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Everything true of `session`, as events with a key each.
 *
 * `ticket_type` is always "paid": the game has no free or bonus round, so
 * reporting anything else would be describing a product that does not exist.
 * The property is in the catalog, so it is sent honestly rather than omitted.
 */
export function chickenReports(session: ChickenSession): ChickenReport[] {
  const id = session.sessionId;
  const staked = num(session.amount);
  const reports: ChickenReport[] = [
    {
      key: `${id}:started`,
      name: "chicken_round_started",
      props: {
        round_id: id,
        amount_usd: staked,
        difficulty: session.difficulty,
        ticket_type: "paid",
      },
    },
  ];

  // Only the lanes actually cleared. A lane the chicken did not survive is the
  // loss, and is reported as one below rather than as an advance.
  for (const step of session.steps) {
    if (!step.won) continue;
    reports.push({
      key: `${id}:lane:${step.step}`,
      name: "chicken_lane_advanced",
      props: { round_id: id, lane_index: step.step, multiplier: num(step.multiplier) },
    });
  }

  if (session.status === "cashed_out") {
    reports.push({
      key: `${id}:settled`,
      name: "chicken_cashed_out",
      props: {
        round_id: id,
        lane_index: session.currentStep,
        multiplier: num(session.currentMultiplier),
        amount_usd: staked,
        payout_usd: num(session.payout),
      },
    });
  } else if (session.status === "lost") {
    reports.push({
      key: `${id}:settled`,
      name: "chicken_round_lost",
      props: {
        round_id: id,
        lane_index: session.currentStep,
        multiplier: num(session.currentMultiplier),
        amount_usd: staked,
      },
    });
  }

  return reports;
}
