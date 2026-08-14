import { describe, expect, it } from "vitest";
import {
  MAX_REMEMBERED,
  newDepositArrivals,
  rememberArrivals,
} from "@/lib/analytics/deposit-watch";
import type { ActivityItem } from "@/lib/server/activity";

function item(over: Partial<ActivityItem>): ActivityItem {
  return {
    id: "0xabc:log:1",
    hash: "0xabc",
    network: "base-mainnet",
    direction: "in",
    symbol: "USDC",
    amount: 25,
    timestamp: 1_000,
    counterparty: null,
    logo: null,
    ...over,
  };
}

describe("newDepositArrivals", () => {
  it("reports an inbound stablecoin transfer as a deposit", () => {
    expect(newDepositArrivals([item({})], new Set())).toEqual([
      { id: "0xabc:log:1", network: "base-mainnet", amountUsd: 25 },
    ]);
  });

  it("ignores anything already reported, so reopening the app is silent", () => {
    expect(newDepositArrivals([item({})], new Set(["0xabc:log:1"]))).toEqual([]);
  });

  it("ignores outbound transfers", () => {
    expect(newDepositArrivals([item({ direction: "out" })], new Set())).toEqual([]);
  });

  it("ignores tokens whose amount is not their dollar value", () => {
    // Reporting amount_usd from an ETH amount would overstate a deposit by
    // three orders of magnitude.
    expect(newDepositArrivals([item({ symbol: "ETH", amount: 0.01 })], new Set())).toEqual([]);
  });

  it("ignores a zero-value transfer", () => {
    expect(newDepositArrivals([item({ amount: 0 })], new Set())).toEqual([]);
  });

  it("returns several arrivals oldest first", () => {
    const arrivals = newDepositArrivals(
      [
        item({ id: "b", timestamp: 2_000, amount: 5 }),
        item({ id: "a", timestamp: 1_000, amount: 10 }),
      ],
      new Set()
    );
    expect(arrivals.map((a) => a.id)).toEqual(["a", "b"]);
  });

  it("matches the id exactly, so two transfers in one transaction both count", () => {
    // One hash can carry several transfers; the id, not the hash, is unique.
    const arrivals = newDepositArrivals(
      [item({ id: "0xabc:log:1" }), item({ id: "0xabc:log:2" })],
      new Set(["0xabc:log:1"])
    );
    expect(arrivals.map((a) => a.id)).toEqual(["0xabc:log:2"]);
  });
});

describe("rememberArrivals", () => {
  it("adds the newly reported ids", () => {
    expect(rememberArrivals(new Set(["a"]), ["b"])).toEqual(["a", "b"]);
  });

  it("caps the set by dropping the oldest", () => {
    const seen = new Set(Array.from({ length: MAX_REMEMBERED }, (_, i) => `old-${i}`));
    const next = rememberArrivals(seen, ["new"]);
    expect(next).toHaveLength(MAX_REMEMBERED);
    expect(next.at(-1)).toBe("new");
    expect(next).not.toContain("old-0");
  });
});
