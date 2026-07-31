import { describe, expect, it } from "vitest";
import { buildBuyQuoteBody, normalizeBuyQuote } from "@/lib/buy-quote";
import { BUY_ORIGIN, type BuyRoute } from "@/lib/buy";

const ETH_ARBITRUM: BuyRoute = {
  destinationChainId: 42161,
  chainName: "Arbitrum",
  asset: "0xeeee",
  symbol: "ETH",
  decimals: 18,
  logoUrl: null,
};

describe("buildBuyQuoteBody", () => {
  it("always sends origin USDC on Base and carries the destination route", () => {
    const body = buildBuyQuoteBody({
      route: ETH_ARBITRUM,
      amount: 25_000_000n, // 25 USDC at 6 decimals
      recipient: "0xrecipient",
      refundTo: "0xbase",
      slippageBps: 100,
    });
    expect(body).toEqual({
      originChainId: BUY_ORIGIN.chainId,
      originAsset: BUY_ORIGIN.asset,
      destinationChainId: 42161,
      destinationAsset: "0xeeee",
      amount: "25000000",
      recipient: "0xrecipient",
      refundTo: "0xbase",
      slippageBps: 100,
    });
  });
});

describe("normalizeBuyQuote", () => {
  it("reads the live quote fields (amountOut / depositRequestId)", () => {
    const quote = normalizeBuyQuote(
      {
        success: true,
        amountOut: "38402",
        minAmountOut: "38018",
        depositAddress: "0xdeposit",
        depositRequestId: "req_1",
        expiresInSeconds: 120,
      },
      8
    );
    expect(quote.estimatedOutput).toBe(38_402n);
    expect(quote.minOutput).toBe(38_018n);
    expect(quote.depositAddress).toBe("0xdeposit");
    expect(quote.requestId).toBe("req_1");
    expect(quote.expiresInSeconds).toBe(120);
  });

  it("falls back to amountOut when minAmountOut is absent", () => {
    const quote = normalizeBuyQuote(
      { amountOut: "1000000", depositAddress: "0xd", depositRequestId: "r" },
      6
    );
    expect(quote.estimatedOutput).toBe(1_000_000n);
    expect(quote.minOutput).toBe(1_000_000n);
  });

  it("defensively parses a human-decimal output without precision loss", () => {
    // 0.0062 ETH at 18 decimals -> 6_200_000_000_000_000 base units.
    const quote = normalizeBuyQuote(
      { amountOut: "0.0062", depositAddress: "0xd", depositRequestId: "r" },
      18
    );
    expect(quote.estimatedOutput).toBe(6_200_000_000_000_000n);
  });

  it("throws when no output amount is present", () => {
    expect(() => normalizeBuyQuote({ depositAddress: "0xd", depositRequestId: "r" }, 18)).toThrow();
  });

  it("throws when the deposit address or request id is missing", () => {
    expect(() => normalizeBuyQuote({ amountOut: "1", depositRequestId: "r" }, 6)).toThrow();
    expect(() => normalizeBuyQuote({ amountOut: "1", depositAddress: "0xd" }, 6)).toThrow();
  });
});
