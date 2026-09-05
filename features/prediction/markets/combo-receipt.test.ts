import { describe, expect, it } from "vitest";
import { OrderSide, type ComboQuote } from "@polymarket/client";
import { comboBookingCode, comboQuoteOddsE6, createComboBetReceipt } from "./combo-receipt";

const quote = {
  rfqId: "rfq-12345678-90ab-cdef",
  quoteId: "quote-1",
  builderCode: `0x${"1".repeat(64)}`,
  positionId: "123",
  makerAmount: "0.1",
  takerAmount: "1.14",
  blendedPrice: "0.087719",
  totalRequired: "0.1",
  expiresAt: Date.now() + 10_000,
  direction: OrderSide.BUY,
} as ComboQuote;

describe("Combo bet receipts", () => {
  it("creates a stable short booking code from the RFQ ID", () => {
    expect(comboBookingCode("rfq-12345678-90ab-cdef")).toBe("0GD79V");
  });

  it("uses executable quote values in the receipt", () => {
    expect(comboQuoteOddsE6(quote)).toBe(11_400_000n);
    expect(
      createComboBetReceipt({
        quote,
        transactionHash: `0x${"2".repeat(64)}`,
        selections: [{ eventTitle: "A vs B", marketLabel: "A", outcome: "Yes" }],
      })
    ).toMatchObject({
      bookingCode: "0GD79V",
      stake: "$0.10",
      potentialReturn: "$1.14",
      decimalOdds: "11.40",
    });
  });
});
