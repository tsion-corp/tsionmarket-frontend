import { describe, expect, it } from "vitest";
import type { SinglesBetReceipt } from "./singles-receipt";
import { parseStoredReceipt } from "./singles-receipt-storage";

const receipt: SinglesBetReceipt = {
  bookingCode: "YN65GR",
  status: "filled",
  persistence: "saved",
  saveError: null,
  requestedStakeE6: "1000000",
  spentE6: "1000000",
  referenceReturnE6: "2000000",
  requestedStake: "$1.00",
  spent: "$1.00",
  referenceReturn: "$2.00",
  filledCount: 1,
  acceptedCount: 1,
  orders: [
    {
      selectionId: "market-1:yes",
      source: "discovery",
      eventId: "event-1",
      eventTitle: "Event one",
      marketId: "market-1",
      conditionId: "condition-1",
      tokenId: "123456",
      marketLabel: "Will it happen?",
      outcome: "Yes",
      status: "filled",
      orderId: "order-1",
      transactionHash: null,
      error: null,
    },
  ],
  placedAt: 1_788_000_000_000,
};

describe("receipt persistence", () => {
  it("restores a receipt for later user-scoped display", () => {
    expect(parseStoredReceipt(JSON.stringify({ userId: "did:privy:1", receipt }))).toEqual({
      userId: "did:privy:1",
      receipt,
    });
  });

  it("rejects malformed booking codes", () => {
    expect(
      parseStoredReceipt(
        JSON.stringify({ userId: "did:privy:1", receipt: { ...receipt, bookingCode: "bad" } })
      )
    ).toBeNull();
  });
});
