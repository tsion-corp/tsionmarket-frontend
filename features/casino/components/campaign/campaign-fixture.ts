import type { ArkadeCampaignJourney } from "@/features/casino/lib/api/arkjet";

// One active campaign with one mission done, shared by the campaign tests.
export const campaignJourney: ArkadeCampaignJourney = {
  campaign: {
    campaignId: "95e90041-6baf-4a6a-8716-b51950dad632",
    slug: "triple-challenge-test",
    displayName: "7-Day Triple Challenge",
    status: "active",
    startsAt: "2026-09-29T00:00:00Z",
    endsAt: "2026-10-06T00:00:00Z",
    secondsRemaining: 604_800,
    currency: "USDC",
    minimumStake: "1.00",
    minimumStakeMinor: 1_000_000,
    targetMultiplier: "11.50",
    targetMultiplierHundredths: 1_150,
    spinStreakTarget: 4,
    prize: "50.00",
    prizeMinor: 50_000_000,
    drawSeedCommitment: "7aa38e524814df49e37be56ff03fcf735c095a0a893add0fca290abb14f2598a",
    drawSeedRevealed: null,
    qualifiedEntrants: 12,
  },
  progress: {
    arkjet: { completed: true, bestMultiplier: "12.40", targetMultiplier: "11.50" },
    chickenCross: { completed: false, bestMultiplier: "8.25", targetMultiplier: "11.50" },
    spinDaBottle: { completed: false, currentStreak: 2, bestStreak: 3, targetStreak: 4 },
    qualified: false,
    qualifiedAt: null,
    isWinner: false,
  },
};

export const qualifiedJourney: ArkadeCampaignJourney = {
  ...campaignJourney,
  progress: {
    ...campaignJourney.progress,
    chickenCross: { ...campaignJourney.progress.chickenCross, completed: true },
    spinDaBottle: { ...campaignJourney.progress.spinDaBottle, completed: true },
    qualified: true,
    qualifiedAt: "2026-09-30T00:00:00Z",
  },
};
