import { describe, expect, it } from "vitest";
import type { OrderResponse } from "@polymarket/client";
import type { MarketSlipSelection } from "./bet-slip";
import { createSinglesBetReceipt, singlesBookingCode } from "./singles-receipt";

function selection(index: number): MarketSlipSelection {
  return {
    id: `market-${index}:yes`,
    source: "discovery",
    eventId: `event-${index}`,
    eventTitle: `Event ${index}`,
    marketId: `market-${index}`,
    conditionId: `condition-${index}`,
    positionId: null,
    tokenId: `${2000 + index}`,
    marketLabel: `Market ${index}`,
    outcome: "Yes",
    decimalOdds: index + 1,
  };
}

const matched = {
  ok: true,
  orderId: "order-1",
  status: "matched",
  makingAmount: "1",
  takingAmount: "2",
  transactionsHashes: ["0x123"],
  tradeIds: ["trade-1"],
} as unknown as OrderResponse;

describe("Singles ticket receipts", () => {
  it("formats one stable six-character booking code", () => {
    expect(singlesBookingCode("12345678-90ab-cdef")).toBe("7I0C3X");
  });

  it("groups mixed child outcomes into a partially filled ticket", () => {
    const receipt = createSinglesBetReceipt({
      bookingSeed: "12345678-90ab-cdef",
      stakeE6: 1_000_000n,
      placedAt: 100,
      results: [
        { selection: selection(1), response: matched },
        { selection: selection(2), error: "No liquidity" },
      ],
    });

    expect(receipt).toMatchObject({
      bookingCode: "7I0C3X",
      status: "partial",
      persistence: "saving",
      requestedStakeE6: "2000000",
      spentE6: "1000000",
      requestedStake: "$2.00",
      spent: "$1.00",
      filledCount: 1,
      acceptedCount: 1,
      placedAt: 100,
    });
    expect(receipt.orders.map(({ status }) => status)).toEqual(["filled", "failed"]);
    expect(receipt.orders[0]).toMatchObject({
      selectionId: "market-1:yes",
      eventId: "event-1",
      marketId: "market-1",
      tokenId: "2001",
    });
  });

  it("marks an accepted delayed order as pending", () => {
    const response = {
      ok: true,
      orderId: "order-2",
      status: "delayed",
      makingAmount: "0",
      takingAmount: "0",
      transactionsHashes: [],
      tradeIds: [],
    } as unknown as OrderResponse;
    const receipt = createSinglesBetReceipt({
      bookingSeed: "ticket",
      stakeE6: 1_000_000n,
      results: [{ selection: selection(1), response }],
    });

    expect(receipt.status).toBe("pending");
    expect(receipt.orders[0].status).toBe("pending");
  });
});
