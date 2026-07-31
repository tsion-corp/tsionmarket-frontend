"use client";

// Stand-in data for the earn screens.
//
// The earn service is up but cannot reach its database: every endpoint that
// runs a query answers 500, while /health and the image routes (which touch no
// database) answer 200. That leaves the whole feature unbuildable against the
// real thing, so the screens read from here instead until the service is fixed.
//
// This is a temporary shim, and it is deliberately shaped to make removing it
// trivial: the API modules still contain their real calls, each one just checks
// `USE_FIXTURES` first. Turn the flag off and the feature talks to the service
// again with no other change.
//
// Nothing here is presented to the user as real. The listings are obviously
// sample content, so a screenshot cannot be mistaken for a live marketplace.

import type {
  Listing,
  ListingSummary,
  Sponsor,
  Submission,
  SubmissionCheck,
} from "@/lib/earn/api/types";
import { rewardFromApi } from "@/lib/earn/reward";

// Flip to false (or set NEXT_PUBLIC_EARN_FIXTURES=0) once the service has a
// database again. That is the only change needed to go back to live data.
export const USE_FIXTURES = process.env.NEXT_PUBLIC_EARN_FIXTURES !== "0";

// Dates are built relative to now so a deadline never drifts into the past and
// starts rendering every sample listing as closed.
const DAY_MS = 86_400_000;
const inDays = (n: number) => new Date(Date.now() + n * DAY_MS).toISOString();

const SPONSOR_ACME = {
  id: "sponsor_sample_1",
  name: "Sample Labs",
  slug: "sample-labs",
  logo: null,
};

const SPONSOR_ORBIT = {
  id: "sponsor_sample_2",
  name: "Orbit Protocol",
  slug: "orbit-protocol",
  logo: null,
};

function summary(over: Partial<ListingSummary> & Pick<ListingSummary, "id" | "slug" | "title">) {
  return {
    type: "bounty",
    status: "open",
    region: "Global",
    deadline: inDays(9),
    reward: rewardFromApi(1000, "USDC"),
    compensationType: "fixed",
    isPrivate: false,
    isPro: false,
    winnersAnnounced: false,
    submissionCount: 4,
    sponsor: SPONSOR_ACME,
    ...over,
  } as ListingSummary;
}

export const FIXTURE_LISTINGS: ListingSummary[] = [
  summary({
    id: "listing_sample_1",
    slug: "sample-trading-dashboard",
    title: "Build a trading dashboard widget",
    reward: rewardFromApi(2500, "USDC"),
    submissionCount: 7,
    deadline: inDays(5),
    isPro: true,
  }),
  summary({
    id: "listing_sample_2",
    slug: "sample-wallet-onboarding-copy",
    title: "Rewrite the wallet onboarding copy",
    type: "project",
    reward: rewardFromApi(800, "USDC"),
    submissionCount: 2,
    sponsor: SPONSOR_ORBIT,
    deadline: inDays(14),
  }),
  summary({
    id: "listing_sample_3",
    slug: "sample-liquidity-research",
    title: "Research report: on-chain liquidity across Base",
    type: "grant",
    reward: rewardFromApi(5000, "USDC"),
    submissionCount: 1,
    sponsor: SPONSOR_ORBIT,
    deadline: inDays(21),
  }),
  summary({
    id: "listing_sample_4",
    slug: "sample-mobile-perf-audit",
    title: "Mobile performance audit",
    reward: rewardFromApi(1200, "USDC"),
    status: "review",
    submissionCount: 11,
    deadline: inDays(-2),
  }),
];

export function fixtureListing(slug: string): Listing {
  const base = FIXTURE_LISTINGS.find((listing) => listing.slug === slug) ?? FIXTURE_LISTINGS[0];

  return {
    ...base,
    description: [
      "This is sample content shown while the earn service is unavailable.",
      "Build the thing described in the title, then submit a link to your work. The sponsor reviews every entry after the deadline and picks winners.",
      "Anything you ship should run, be readable, and come with a short note on what you did and why.",
    ].join("\n\n"),
    commitmentDate: inDays(30),
    pocSocials: "https://t.me/sample",
    skills: [
      { skill: "Frontend", subskills: ["React", "TypeScript"] },
      { skill: "Design", subskills: [] },
    ],
    rewards: [{ position: 1, amount: base.reward ?? rewardFromApi(1000, "USDC")! }],
    isFndnPaying: false,
    agentAccess: "HUMAN_ONLY",
    eligibility: [],
    isPublished: true,
  };
}

// No sponsor by default, so the sponsor screens open on their sign-up prompt
// rather than pretending the user already runs a company.
export const FIXTURE_SPONSOR: Sponsor | null = null;

export const FIXTURE_SUBMISSIONS: Submission[] = [
  {
    id: "submission_sample_1",
    listingId: "listing_sample_1",
    link: "https://github.com/sample/entry-one",
    tweet: null,
    otherInfo: "Sample entry shown while the earn service is unavailable.",
    telegram: "https://t.me/sample",
    status: "pending",
    winnerPosition: null,
    createdAt: inDays(-1),
    eligibilityAnswers: [],
    applicant: { id: "user_sample_1", username: "sampleuser", photo: null, telegram: null },
  },
  {
    id: "submission_sample_2",
    listingId: "listing_sample_1",
    link: "https://github.com/sample/entry-two",
    tweet: null,
    otherInfo: null,
    telegram: null,
    status: "pending",
    winnerPosition: null,
    createdAt: inDays(-2),
    eligibilityAnswers: [],
    applicant: { id: "user_sample_2", username: "anotheruser", photo: null, telegram: null },
  },
];

export const FIXTURE_SUBMISSION_CHECK: SubmissionCheck = {
  hasSubmitted: false,
  submissionId: null,
  isWinner: false,
  winnerPosition: null,
  winnersAnnounced: false,
  kycVerified: false,
  isPaid: false,
};
