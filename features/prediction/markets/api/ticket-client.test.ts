import { describe, expect, it } from "vitest";
import type { SinglesBetReceipt } from "../singles-receipt";
import type { SinglesTicket } from "./types";
import { buildSinglesTicketBody, singlesTicketToReceipt } from "./ticket-client";

const receipt: SinglesBetReceipt = {
  bookingCode: "YN65GR",
  status: "filled",
  persistence: "saving",
  saveError: null,
  requestedStakeE6: "1000000",
  spentE6: "995000",
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

describe("Singles ticket persistence payload", () => {
  it("keeps canonical amounts and excludes presentation-only state", () => {
    expect(buildSinglesTicketBody(receipt)).toEqual({
      bookingCode: "YN65GR",
      status: "filled",
      requestedStakeE6: "1000000",
      spentE6: "995000",
      referenceReturnE6: "2000000",
      filledCount: 1,
      acceptedCount: 1,
      orders: receipt.orders,
      placedAt: 1_788_000_000_000,
    });
  });

  it("hydrates a fetched ticket for the confirmation modal", () => {
    const ticket: SinglesTicket = {
      ...buildSinglesTicketBody(receipt),
      id: "4be8c170-c34e-4c12-a90c-2d9dfe8af094",
      placedAt: "2026-08-26T12:00:00Z",
      createdAt: "2026-08-26T12:00:01Z",
      updatedAt: "2026-08-26T12:00:01Z",
    };

    expect(singlesTicketToReceipt(ticket)).toMatchObject({
      bookingCode: "YN65GR",
      persistence: "saved",
      requestedStake: "$1.00",
      spent: "$1.00",
      referenceReturn: "$2.00",
      placedAt: Date.parse("2026-08-26T12:00:00Z"),
    });
  });
});
