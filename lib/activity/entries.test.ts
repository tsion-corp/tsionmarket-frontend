import { describe, expect, it } from "vitest";
import { buildActivityEntries } from "@/lib/activity/entries";
import type { ActivityItem } from "@/lib/server/activity";

let seq = 0;
function item(over: Partial<ActivityItem>): ActivityItem {
  seq += 1;
  return {
    id: `i${seq}`,
    hash: `0xhash${seq}`,
    network: "base-mainnet",
    direction: "in",
    symbol: "USDC",
    amount: 10,
    timestamp: 1_700_000_000_000,
    counterparty: null,
    logo: null,
    ...over,
  };
}

describe("cross-chain pairing", () => {
  it("merges an asset sale settling on another chain into one sold entry", () => {
    // Selling SOL: the SOL leaves Solana, the USDC lands on Base seconds later.
    const entries = buildActivityEntries([
      item({ symbol: "SOL", direction: "out", network: "solana-mainnet", amount: 0.0082 }),
      item({ symbol: "USDC", direction: "in", amount: 18.5462, timestamp: 1_700_000_030_000 }),
    ]);
    expect(entries).toHaveLength(1);
    expect(entries[0].kind).toBe("sold");
    expect(entries[0].symbol).toBe("SOL");
    expect(entries[0].counterSymbol).toBe("USDC");
    expect(entries[0].counterAmount).toBe(18.5462);
  });

  it("merges money leaving for an asset arriving on another chain into bought", () => {
    const entries = buildActivityEntries([
      item({ symbol: "USDC", direction: "out", amount: 20 }),
      item({
        symbol: "SOL",
        direction: "in",
        network: "solana-mainnet",
        amount: 0.1,
        timestamp: 1_700_000_045_000,
      }),
    ]);
    expect(entries).toHaveLength(1);
    expect(entries[0].kind).toBe("bought");
    expect(entries[0].symbol).toBe("SOL");
  });

  it("ignores a deposit that landed before the sale when picking the payout", () => {
    // The real trio from production: $18.55 arrived a minute BEFORE the SOL
    // left, then $0.68 settled seconds after it. The earlier deposit cannot be
    // this sale's payout, so the later one pairs and the earlier one stays a
    // plain deposit.
    const entries = buildActivityEntries([
      item({
        symbol: "USDC",
        direction: "in",
        amount: 18.5462,
        timestamp: 1_700_000_000_000 - 70_000,
      }),
      item({ symbol: "SOL", direction: "out", network: "solana-mainnet", amount: 0.0082 }),
      item({ symbol: "USDC", direction: "in", amount: 0.6777, timestamp: 1_700_000_025_000 }),
    ]);
    expect(entries.map((e) => e.kind).sort()).toEqual(["deposited", "sold"]);
    const sold = entries.find((e) => e.kind === "sold")!;
    expect(sold.symbol).toBe("SOL");
    expect(sold.counterAmount).toBe(0.6777);
  });

  it("refuses to merge when two deposits could both be the payout", () => {
    const entries = buildActivityEntries([
      item({ symbol: "SOL", direction: "out", network: "solana-mainnet", amount: 1 }),
      item({ symbol: "USDC", direction: "in", amount: 18, timestamp: 1_700_000_020_000 }),
      item({ symbol: "USDC", direction: "in", amount: 25, timestamp: 1_700_000_040_000 }),
    ]);
    expect(entries.map((e) => e.kind).sort()).toEqual(["deposited", "deposited", "sent"]);
  });

  it("leaves legs outside the settlement window as separate movements", () => {
    const entries = buildActivityEntries([
      item({ symbol: "SOL", direction: "out", network: "solana-mainnet", amount: 1 }),
      item({
        symbol: "USDC",
        direction: "in",
        amount: 18,
        timestamp: 1_700_000_000_000 + 10 * 60_000,
      }),
    ]);
    expect(entries.map((e) => e.kind).sort()).toEqual(["deposited", "sent"]);
  });

  it("never pairs across the same chain, where a real trade shares a hash", () => {
    const entries = buildActivityEntries([
      item({ symbol: "ETH", direction: "out", amount: 0.01 }),
      item({ symbol: "USDC", direction: "in", amount: 30, timestamp: 1_700_000_010_000 }),
    ]);
    expect(entries).toHaveLength(2);
  });
});
