import { describe, expect, it } from "vitest";
import {
  SHINE_MAX_SETTLEMENT_AGE_MS,
  closedPositionRoi,
  settledRecently,
  swapShineFacts,
  swapUnitPrice,
} from "@/features/trade/lib/shine-trade";
import { pnlCardModel } from "@/features/trade/lib/pnl-card";
import type { HlClosedPositionView } from "@/features/trade/lib/hyperliquid-types";
import type { PreparedSwap } from "@/lib/meme/api";

// The one figure a trade may put in a public post, and there is no confirmation
// step and no way to correct it afterwards. So: exact, or absent.

const USDC = { address: "0xusdc", symbol: "USDC", decimals: 6 };
const PEPE = { address: "0xpepe", symbol: "PEPE", decimals: 18 };

function quote(over: Partial<PreparedSwap>): PreparedSwap {
  return {
    swapId: "swap-1",
    chainId: 8453,
    side: "BUY",
    sellToken: USDC,
    buyToken: PEPE,
    sellAmountAtomic: "10000000",
    expectedBuyAmountAtomic: "2380952380952380952380",
    minimumBuyAmountAtomic: "0",
    calls: [],
    expiresAt: new Date().toISOString(),
    ...over,
  };
}

describe("swapUnitPrice", () => {
  it("divides the USDC leg by the token leg", () => {
    // $10 for 2,380.952380952380952380 PEPE is $0.0042 each.
    expect(swapUnitPrice("10000000", 6, "2380952380952380952380", 18)).toBe("$0.0042");
  });

  it("keeps four significant digits on a price far below a cent", () => {
    // $10 for 2,380,952.380952380952380952 tokens is $0.0000042 each, which is
    // the price this whole pipeline exists for: a double loses its tail.
    expect(swapUnitPrice("10000000", 6, "2380952380952380952380952", 18)).toBe("$0.0000042");
  });

  it("prices a token worth more than a dollar", () => {
    // 214.30 USDC for one 18-decimal token.
    expect(swapUnitPrice("214300000", 6, "1000000000000000000", 18)).toBe("$214.30");
  });

  it("is null rather than wrong when a leg is missing or unreadable", () => {
    expect(swapUnitPrice(null, 6, "1000000000000000000", 18)).toBeNull();
    expect(swapUnitPrice("10000000", null, "1000000000000000000", 18)).toBeNull();
    expect(swapUnitPrice("10000000", 6, "0", 18)).toBeNull();
    expect(swapUnitPrice("1.5", 6, "1000000000000000000", 18)).toBeNull();
    expect(swapUnitPrice("10000000", 6.5, "1000000000000000000", 18)).toBeNull();
    expect(swapUnitPrice("10000000", 6, "1000000000000000000", 99)).toBeNull();
  });
});

describe("swapShineFacts", () => {
  it("prices a buy in the USDC it was paid for with", () => {
    expect(swapShineFacts(quote({}))).toEqual({ symbol: "PEPE", price: "$0.0042" });
  });

  it("prices a sell in the USDC it paid out", () => {
    expect(
      swapShineFacts(
        quote({
          side: "SELL",
          sellToken: PEPE,
          buyToken: USDC,
          sellAmountAtomic: "2380952380952380952380",
          expectedBuyAmountAtomic: "10000000",
        })
      )
    ).toEqual({ symbol: "PEPE", price: "$0.0042" });
  });

  it("reports no symbol when the quote names none, rather than guessing one", () => {
    const facts = swapShineFacts(quote({ buyToken: { ...PEPE, symbol: null } }));
    expect(facts.symbol).toBeNull();
  });

  it("reports no price when the quote gives no decimals for the token", () => {
    const facts = swapShineFacts(quote({ buyToken: { ...PEPE, decimals: null } }));
    expect(facts.symbol).toBe("PEPE");
    expect(facts.price).toBeNull();
  });
});

describe("settledRecently", () => {
  const now = Date.parse("2026-09-24T12:00:00.000Z");

  it("accepts a close from the last day", () => {
    expect(settledRecently(new Date(now - 60_000).toISOString(), now)).toBe(true);
    expect(settledRecently(new Date(now - 23 * 60 * 60 * 1000).toISOString(), now)).toBe(true);
  });

  // The backlog case: on the day Shine ships the dedup store is empty and the
  // app is full of settled state, and a post carries no date.
  it("refuses a close older than the bound", () => {
    expect(
      settledRecently(new Date(now - SHINE_MAX_SETTLEMENT_AGE_MS - 1).toISOString(), now)
    ).toBe(false);
  });

  it("refuses a time it cannot read, and one in the future", () => {
    expect(settledRecently(null, now)).toBe(false);
    expect(settledRecently("", now)).toBe(false);
    expect(settledRecently("yesterday", now)).toBe(false);
    expect(settledRecently(new Date(now + 60_000).toISOString(), now)).toBe(false);
  });
});

/**
 * The return on a closed position, and the one thing that matters about it:
 * it has to be the SAME number the share card shows for the same trade. A
 * post and a card disagreeing about one position is worse than either alone,
 * and the post is the one that cannot be corrected.
 */
describe("closedPositionRoi", () => {
  function closed(over: Partial<HlClosedPositionView> = {}): HlClosedPositionView {
    return {
      id: "position-1",
      walletId: "wallet-1",
      assetId: "asset-btc",
      symbol: "BTC",
      side: "long",
      size: "0.0156",
      entryPrice: "64000",
      leverage: 10,
      marginMode: "isolated",
      status: "closed",
      closeReason: "manual_close",
      closePrice: "67200",
      realizedPnlUsdc: "49.92",
      openedAt: "2026-09-24T11:00:00.000Z",
      closedAt: "2026-09-24T12:00:00.000Z",
      ...over,
    };
  }

  it.each([
    ["49.92", "+50%"],
    ["-24.96", "-25%"],
    ["0", "0%"],
    ["4.992", "+5%"],
  ])("turns a realised %s into %s", (realizedPnlUsdc, expected) => {
    expect(closedPositionRoi(closed({ realizedPnlUsdc }))).toBe(expected);
  });

  it("agrees with the share card for the same record", () => {
    for (const realizedPnlUsdc of ["49.92", "-24.96", "0", "4.992", "-99.84"]) {
      const position = closed({ realizedPnlUsdc });
      const card = pnlCardModel(position);
      // The card pads to two places and this trims them, so the comparison is
      // on the value rather than on its rendering.
      expect(Number(closedPositionRoi(position)?.replace("%", ""))).toBeCloseTo(
        Number(card.roiLabel.replace("%", "")),
        6
      );
    }
  });

  it("keeps every digit of a position priced past what a double holds", () => {
    // 2^53 is about 9.007e15; this margin is far beyond it and the answer is
    // still exactly +10%.
    const position = closed({
      entryPrice: "10000000000000000000",
      size: "1",
      leverage: 1,
      realizedPnlUsdc: "1000000000000000000",
    });
    expect(closedPositionRoi(position)).toBe("+10%");
  });

  it("states no return rather than a wrong one", () => {
    expect(closedPositionRoi(closed({ realizedPnlUsdc: "n/a" }))).toBeNull();
    expect(closedPositionRoi(closed({ entryPrice: "0" }))).toBeNull();
    expect(closedPositionRoi(closed({ size: "0" }))).toBeNull();
    expect(closedPositionRoi(closed({ leverage: 0 }))).toBeNull();
    expect(closedPositionRoi(closed({ leverage: 2.5 }))).toBeNull();
  });
});
