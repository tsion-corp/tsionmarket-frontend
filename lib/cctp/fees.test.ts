import { describe, expect, it } from "vitest";
import { CCTP_FINALITY } from "@/lib/cctp/config";
import { maxFeeFromQuote, parseFeeQuote } from "@/lib/cctp/fees";

// maxFee is the most a CCTP burn lets Circle take at mint. Too low and the burn
// is never minted, so every figure here rounds UP, in USDC base units (6dp).

const QUOTE = [
  { finalityThreshold: 1000, minimumFee: 1, forwardFee: { low: 90, medium: 110, high: 160 } },
  { finalityThreshold: 2000, minimumFee: 0, forwardFee: { low: 90, medium: 110, high: 160 } },
];

describe("parseFeeQuote", () => {
  it("accepts Circle's documented shape", () => {
    expect(parseFeeQuote(QUOTE)).toEqual(QUOTE);
  });

  it("accepts a quote without forwarding fees", () => {
    expect(parseFeeQuote([{ finalityThreshold: 1000, minimumFee: 1.3 }])).toEqual([
      { finalityThreshold: 1000, minimumFee: 1.3 },
    ]);
  });

  it("refuses anything else rather than guessing a fee", () => {
    expect(parseFeeQuote({ fees: [] })).toBeNull();
    expect(parseFeeQuote([{ finalityThreshold: "1000", minimumFee: 1 }])).toBeNull();
    expect(parseFeeQuote([{ finalityThreshold: 1000, minimumFee: -1 }])).toBeNull();
  });
});

describe("maxFeeFromQuote", () => {
  it("charges the protocol fee in basis points of the amount, for the chosen finality", () => {
    // 100 USDC at 1 bps is 0.01 USDC = 10_000 base units.
    expect(
      maxFeeFromQuote({
        amount: 100_000_000n,
        quote: QUOTE,
        finality: CCTP_FINALITY.fast,
        includeForwardFee: false,
      })
    ).toBe(10_000n);
  });

  it("adds Circle's high forwarding fee when the user pays for the forward", () => {
    expect(
      maxFeeFromQuote({
        amount: 100_000_000n,
        quote: QUOTE,
        finality: CCTP_FINALITY.fast,
        includeForwardFee: true,
      })
    ).toBe(10_160n);
  });

  it("rounds a fractional fee up, never down", () => {
    // 1 USDC at 1.3 bps is 130 base units exactly; 1.000001 USDC is 130.00013,
    // which must become 131.
    const quote = [{ finalityThreshold: 1000, minimumFee: 1.3 }];
    expect(
      maxFeeFromQuote({ amount: 1_000_000n, quote, finality: 1000, includeForwardFee: false })
    ).toBe(130n);
    expect(
      maxFeeFromQuote({ amount: 1_000_001n, quote, finality: 1000, includeForwardFee: false })
    ).toBe(131n);
  });

  it("returns null when the quote has no row for the finality asked for", () => {
    expect(
      maxFeeFromQuote({
        amount: 1_000_000n,
        quote: [{ finalityThreshold: 2000, minimumFee: 0 }],
        finality: CCTP_FINALITY.fast,
        includeForwardFee: false,
      })
    ).toBeNull();
  });

  it("returns null when a forward fee is required but the quote carries none", () => {
    expect(
      maxFeeFromQuote({
        amount: 1_000_000n,
        quote: [{ finalityThreshold: 1000, minimumFee: 1 }],
        finality: 1000,
        includeForwardFee: true,
      })
    ).toBeNull();
  });
});
