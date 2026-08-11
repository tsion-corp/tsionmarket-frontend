import { describe, expect, it } from "vitest";
import { findReturnable, isReturnable, winningSide } from "@/features/prediction/lib/lp-return";
import type { LpPosition, Market, MarketStatus, Outcome } from "@/features/prediction/lib/types";

function market(id: bigint, status: MarketStatus, outcome: Outcome): Market {
  return {
    marketId: id,
    creator: "0xcreator",
    question: null,
    category: null,
    imageUrl: null,
    description: null,
    rules: null,
    resolutionSource: null,
    status,
    outcome,
    closeTime: 0,
    feeBps: 200,
    priceYes: 500_000n,
    priceNo: 500_000n,
    rYes: 2_000_000n,
    rNo: 2_000_000n,
    totalLp: 2_000_000n,
    collateral: 2_000_000n,
    volumeUsdc: 0n,
  };
}

const lp = (id: bigint, shares: bigint): LpPosition => ({ marketId: id, lpShares: shares });

describe("winningSide", () => {
  it("names the side that redeems after a definite resolution", () => {
    expect(winningSide("Resolved", "Yes")).toBe("yes");
    expect(winningSide("Resolved", "No")).toBe("no");
  });

  it("is null while the market is still live", () => {
    expect(winningSide("Open", "Unresolved")).toBeNull();
    expect(winningSide("Closed", "Unresolved")).toBeNull();
  });

  // An invalidated market unwinds on terms we have not verified, so it must
  // never be swept up by the automatic return.
  it("is null for an invalid market", () => {
    expect(winningSide("Invalid", "Unresolved")).toBeNull();
    expect(winningSide("Invalid", "Yes")).toBeNull();
  });
});

describe("isReturnable", () => {
  it("requires both a resolution and a live LP balance", () => {
    expect(isReturnable(market(1n, "Resolved", "Yes"), 2_000_000n)).toBe(true);
    expect(isReturnable(market(1n, "Resolved", "Yes"), 0n)).toBe(false);
    expect(isReturnable(market(1n, "Open", "Unresolved"), 2_000_000n)).toBe(false);
  });
});

describe("findReturnable", () => {
  const markets = [
    market(1n, "Resolved", "Yes"),
    market(2n, "Open", "Unresolved"),
    market(3n, "Resolved", "No"),
    market(4n, "Invalid", "Unresolved"),
  ];
  const positions: LpPosition[] = [lp(1n, 2_000_000n), lp(2n, 5n), lp(3n, 1n), lp(4n, 9n)];

  it("picks only resolved markets the wallet still has LP in", () => {
    const found = findReturnable(markets, positions);
    expect(found.map((f) => f.market.marketId)).toEqual([1n, 3n]);
    expect(found[0].side).toBe("yes");
    expect(found[1].side).toBe("no");
    expect(found[0].lpShares).toBe(2_000_000n);
  });

  // The read model lags a confirmed transaction, so a just-returned market still
  // looks returnable. Without the skip set the app would pay it out twice.
  it("skips ids already handled this session", () => {
    const found = findReturnable(markets, positions, new Set(["1"]));
    expect(found.map((f) => f.market.marketId)).toEqual([3n]);
  });

  it("returns nothing when the wallet holds no LP", () => {
    expect(findReturnable(markets, [])).toEqual([]);
  });
});
