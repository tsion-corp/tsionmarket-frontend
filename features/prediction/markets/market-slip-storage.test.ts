import { describe, expect, it } from "vitest";
import { parseMarketSlipSnapshot } from "./market-slip-storage";

const selection = {
  id: "market-1:yes",
  source: "discovery",
  eventId: "event-1",
  eventTitle: "Event one",
  marketId: "market-1",
  conditionId: "condition-1",
  positionId: null,
  tokenId: "123456",
  marketLabel: "Will it happen?",
  outcome: "Yes",
  decimalOdds: 2,
};

describe("market slip persistence", () => {
  it("restores valid selections and stake", () => {
    expect(
      parseMarketSlipSnapshot(JSON.stringify({ selections: [selection], stake: "10" }))
    ).toEqual({ selections: [selection], stake: "10", submissionReview: null });
  });

  it("restores an unresolved submission marker", () => {
    expect(
      parseMarketSlipSnapshot(
        JSON.stringify({
          selections: [selection],
          stake: "10",
          submissionReview: { attemptedAt: 123, selectionIds: [selection.id] },
        })
      ).submissionReview
    ).toEqual({ attemptedAt: 123, selectionIds: [selection.id] });
  });

  it("drops corrupt or oversized snapshots", () => {
    expect(parseMarketSlipSnapshot("not json")).toEqual({
      selections: [],
      stake: "5",
      submissionReview: null,
    });
    expect(
      parseMarketSlipSnapshot(JSON.stringify({ selections: Array(16).fill(selection), stake: "5" }))
    ).toEqual({ selections: [], stake: "5", submissionReview: null });
  });
});
