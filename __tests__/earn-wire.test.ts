import { describe, expect, it } from "vitest";
import {
  toListing,
  toListingSummaries,
  toSubmission,
  toSubmissionCheck,
  type ListingWire,
  type SubmissionWire,
} from "@/lib/earn/api/wire";

// The earn contract documents request bodies but not responses, so these pin
// the normalizers against a field going missing or arriving with a value we do
// not recognise. Losing one field must never take a screen down.

function listing(over: Partial<ListingWire> = {}): ListingWire {
  return {
    id: "listing_1",
    slug: "test-listing",
    title: "Test Listing",
    description: "Build something useful",
    type: "bounty",
    status: "open",
    region: "Global",
    deadline: "2026-12-31T23:59:59.000Z",
    commitmentDate: "2027-01-02T23:59:59.000Z",
    pocSocials: "https://t.me/testowner",
    token: "USDC",
    rewardAmount: 1000,
    rewards: { "1": 700, "2": 300 },
    compensationType: "fixed",
    isPrivate: false,
    isPro: false,
    isFndnPaying: false,
    isPublished: true,
    winnersAnnounced: false,
    agentAccess: "HUMAN_ONLY",
    skills: [{ skills: "Frontend", subskills: ["React"] }],
    sponsor: { id: "sponsor_1", name: "Test Sponsor", slug: "test-sponsor", logo: null },
    ...over,
  };
}

function submission(over: Partial<SubmissionWire> = {}): SubmissionWire {
  return {
    id: "submission_1",
    listingId: "listing_1",
    link: "https://github.com/example/submission",
    otherInfo: "MVP submission",
    telegram: "https://t.me/testsubmitter",
    isWinner: false,
    createdAt: "2026-07-30T10:00:00.000Z",
    user: { id: "user_1", username: "testsubmitter", photo: null, telegram: null },
    ...over,
  };
}

describe("listing", () => {
  it("maps a full listing through", () => {
    const result = toListing(listing());

    expect(result).not.toBeNull();
    expect(result?.title).toBe("Test Listing");
    expect(result?.type).toBe("bounty");
    expect(result?.sponsor?.name).toBe("Test Sponsor");
    expect(result?.skills).toEqual([{ skill: "Frontend", subskills: ["React"] }]);
  });

  it("refuses a listing with no id, since nothing can be done with it", () => {
    expect(toListing(listing({ id: undefined }))).toBeNull();
    expect(toListing(listing({ slug: undefined }))).toBeNull();
  });

  it("falls back rather than dropping a type it doesn't recognise", () => {
    // A listing type added on the server must still render, as a bounty,
    // rather than vanishing from the feed.
    const result = toListing(listing({ type: "residency" }));
    expect(result?.type).toBe("bounty");
  });

  it("falls back rather than dropping an unknown status", () => {
    expect(toListing(listing({ status: "archived" }))?.status).toBe("open");
  });

  it("reports a missing reward as absent rather than as zero", () => {
    // Rendering an unreadable reward as 0 would advertise the work as free.
    const result = toListing(listing({ rewardAmount: undefined }));
    expect(result?.reward).toBeNull();
  });

  it("does not invent a reward split when the listing has none", () => {
    expect(toListing(listing({ rewards: null }))?.rewards).toEqual([]);
  });

  it("orders reward positions numerically, not as text", () => {
    // Keyed by string, so "10" sorts before "2" unless positions are numbers.
    const result = toListing(listing({ rewards: { "1": 500, "2": 300, "10": 200 } }));
    expect(result?.rewards.map((tier) => tier.position)).toEqual([1, 2, 10]);
  });

  it("keeps reward amounts exact in minor units", () => {
    const result = toListing(listing({ rewardAmount: 1000.1, rewards: { "1": 1000.1 } }));
    expect(result?.reward?.minor).toBe("1000100000");
    expect(result?.rewards[0].amount.minor).toBe("1000100000");
  });

  it("treats an absent sponsor as unknown rather than throwing", () => {
    expect(toListing(listing({ sponsor: null }))?.sponsor).toBeNull();
  });

  it("reads a submission count from either shape the service uses", () => {
    expect(toListing(listing({ submissionCount: 7 }))?.submissionCount).toBe(7);
    expect(toListing(listing({ _count: { Submission: 4 } }))?.submissionCount).toBe(4);
    expect(toListing(listing())?.submissionCount).toBe(0);
  });

  it("drops only the unreadable listings from a feed", () => {
    const feed = toListingSummaries([listing(), listing({ id: undefined }), listing({ id: "b" })]);
    expect(feed.map((item) => item.id)).toEqual(["listing_1", "b"]);
  });

  it("treats a feed that is not an array as empty", () => {
    expect(toListingSummaries(null)).toEqual([]);
    expect(toListingSummaries(undefined)).toEqual([]);
  });
});

describe("submission", () => {
  it("reports a plain entry as pending", () => {
    expect(toSubmission(submission())?.status).toBe("pending");
  });

  it("reports a winner as a winner regardless of the status field", () => {
    const result = toSubmission(submission({ isWinner: true, winnerPosition: 1 }));
    expect(result?.status).toBe("winner");
    expect(result?.winnerPosition).toBe(1);
  });

  it("reports a rejected entry as rejected", () => {
    expect(toSubmission(submission({ status: "rejected" }))?.status).toBe("rejected");
  });

  it("leaves an applicant absent rather than inventing one", () => {
    expect(toSubmission(submission({ user: null }))?.applicant).toBeNull();
  });

  it("refuses an entry with no id", () => {
    expect(toSubmission(submission({ id: undefined }))).toBeNull();
  });

  it("keeps eligibility answers that have a question", () => {
    const result = toSubmission(
      submission({
        eligibilityAnswers: [
          { question: "Why you?", answer: "Shipped this before." },
          { answer: "orphaned" },
        ],
      })
    );
    expect(result?.eligibilityAnswers).toEqual([
      { question: "Why you?", answer: "Shipped this before." },
    ]);
  });
});

describe("submission check", () => {
  it("reads every flag the payment banner branches on", () => {
    const result = toSubmissionCheck({
      hasSubmitted: true,
      isWinner: true,
      winnerPosition: 2,
      winnersAnnounced: true,
      kycVerified: false,
      isPaid: false,
    });
    expect(result).toMatchObject({
      hasSubmitted: true,
      isWinner: true,
      winnerPosition: 2,
      kycVerified: false,
    });
  });

  it("defaults to nothing having happened when the body is missing", () => {
    // A missing body must not read as "you won", which is the dangerous
    // direction for this particular default to fail in.
    const result = toSubmissionCheck(null);
    expect(result.hasSubmitted).toBe(false);
    expect(result.isWinner).toBe(false);
    expect(result.winnersAnnounced).toBe(false);
  });
});
