import { describe, expect, it } from "vitest";
import {
  amountFromBaseUnits,
  pricedTradeAmounts,
  swapTradeAmounts,
  tradeAmounts,
} from "@/lib/analytics/trade-amounts";

const BASE = 8453;
const BASE_USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
const TOSHI = "0xac1bd2486aaf3b5c0fc3fd868558b082a531b2b4";

describe("amountFromBaseUnits", () => {
  it("converts USDC base units exactly", () => {
    expect(amountFromBaseUnits(12_400_000n, 6)).toBe(12.4);
    expect(amountFromBaseUnits(1n, 6)).toBe(0.000001);
    expect(amountFromBaseUnits(0n, 6)).toBe(0);
  });

  it("converts 18-decimal amounts past 2^53 base units without dividing a float", () => {
    // 341,552.8 tokens at 18 decimals is ~3.4e23 base units, far past 2^53.
    expect(amountFromBaseUnits(341_552_800_000_000_000_000_000n, 18)).toBe(341552.8);
  });
});

describe("tradeAmounts", () => {
  it("reports the dollar leg as amount_usd and the token leg as token_quantity", () => {
    expect(
      tradeAmounts({
        usdRaw: 5_000_000n,
        usdDecimals: 6,
        tokenRaw: 1_000_000_000_000_000_000_000_000n,
        tokenDecimals: 18,
        source: "fill",
      })
    ).toEqual({
      amount_usd: 5,
      token_quantity: 1_000_000,
      fill_price_usd: 0.000005,
      amount_source: "fill",
    });
  });

  it("omits token_quantity when the token leg is unknown", () => {
    expect(
      tradeAmounts({
        usdRaw: 2_000_000n,
        usdDecimals: 6,
        tokenRaw: null,
        tokenDecimals: null,
        source: "fill",
      })
    ).toEqual({ amount_usd: 2, amount_source: "fill" });
  });
});

describe("swapTradeAmounts", () => {
  const sellQuote = {
    chainId: BASE,
    side: "SELL" as const,
    sellToken: { address: TOSHI, decimals: 18 },
    buyToken: { address: BASE_USDC, decimals: 6 },
    // One million tokens in, about $5 out.
    sellAmountAtomic: "1000000000000000000000000",
    expectedBuyAmountAtomic: "5000000",
  };

  it("prices a sell in dollars, never in tokens (the $1.26M units bug)", () => {
    expect(swapTradeAmounts(sellQuote, null)).toEqual({
      amount_usd: 5,
      token_quantity: 1_000_000,
      fill_price_usd: 0.000005,
      amount_source: "quote",
    });
  });

  it("uses the USDC the receipt proved over the quote on a sell", () => {
    expect(swapTradeAmounts(sellQuote, 4_950_000n)).toEqual({
      amount_usd: 4.95,
      token_quantity: 1_000_000,
      fill_price_usd: 0.000005,
      amount_source: "fill",
    });
  });

  it("prices a buy by the USDC spent and counts the tokens received", () => {
    const buyQuote = {
      chainId: BASE,
      side: "BUY" as const,
      sellToken: { address: BASE_USDC, decimals: 6 },
      buyToken: { address: TOSHI, decimals: 18 },
      sellAmountAtomic: "2000000",
      expectedBuyAmountAtomic: "400000000000000000000000",
    };
    expect(swapTradeAmounts(buyQuote, 390_000_000_000_000_000_000_000n)).toEqual({
      amount_usd: 2,
      token_quantity: 390_000,
      fill_price_usd: 0.000005,
      amount_source: "fill",
    });
  });

  it("refuses to call a non-USDC leg dollars", () => {
    const weird = { ...sellQuote, buyToken: { address: TOSHI, decimals: 18 } };
    expect(swapTradeAmounts(weird, null)).toBeNull();
  });

  it("refuses when a leg's decimals are unknown", () => {
    const noDecimals = { ...sellQuote, sellToken: { address: TOSHI, decimals: null } };
    expect(swapTradeAmounts(noDecimals, null)).toBeNull();
  });
});

describe("pricedTradeAmounts", () => {
  it("values a sale at quantity times the quoted price, marked as a quote", () => {
    // 10.14812065 DOGE at $0.0977.
    expect(pricedTradeAmounts(1_014_812_065n, 8, 0.0977)).toEqual({
      amount_usd: 0.991471,
      token_quantity: 10.14812065,
      // The two amounts divided, rounded to USDC's own precision. Derived
      // rather than passed in, so it cannot disagree with them.
      fill_price_usd: 0.0977,
      amount_source: "quote",
    });
  });
});

describe("swapTradeAmounts on an incomplete quote", () => {
  it("returns null rather than throwing when the quote states no amounts", () => {
    expect(
      swapTradeAmounts(
        {
          chainId: BASE,
          side: "SELL",
          sellToken: { address: TOSHI, decimals: 18 },
          buyToken: { address: BASE_USDC, decimals: 6 },
          sellAmountAtomic: undefined as unknown as string,
          expectedBuyAmountAtomic: "5000000",
        },
        null
      )
    ).toBeNull();
  });
});
