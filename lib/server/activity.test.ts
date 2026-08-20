import { describe, expect, it } from "vitest";
import { buildActivityEntries, isStable } from "@/lib/activity/entries";
import type { ActivityItem } from "@/lib/server/activity";

function transfer(over: Partial<ActivityItem> & Pick<ActivityItem, "symbol" | "direction">) {
  return {
    id: `${over.hash ?? "0xabc"}:${over.symbol}:${over.direction}`,
    hash: "0xabc",
    network: "solana-mainnet",
    amount: 1,
    timestamp: 1_000,
    counterparty: null,
    logo: null,
    ...over,
  } as ActivityItem;
}

describe("buildActivityEntries", () => {
  it("reads a purchase as one action, not two transfers", () => {
    // The real GLDx buy: USDC out and GLDx in, same signature.
    const entries = buildActivityEntries([
      transfer({ symbol: "USDC", direction: "out", amount: 2.876564 }),
      transfer({ symbol: "GLDx", direction: "in", amount: 0.007744 }),
    ]);
    expect(entries).toHaveLength(1);
    expect(entries[0].kind).toBe("bought");
    // Named by what you got, priced by what it cost.
    expect(entries[0].symbol).toBe("GLDx");
    expect(entries[0].amount).toBe(0.007744);
    expect(entries[0].direction).toBe("in");
    expect(entries[0].counterSymbol).toBe("USDC");
    expect(entries[0].counterAmount).toBe(2.876564);
  });

  it("reads the reverse as a sale, named by what was given up", () => {
    const entries = buildActivityEntries([
      transfer({ symbol: "GLDx", direction: "out", amount: 0.007744 }),
      transfer({ symbol: "USDC", direction: "in", amount: 2.875896 }),
    ]);
    expect(entries[0].kind).toBe("sold");
    expect(entries[0].symbol).toBe("GLDx");
    expect(entries[0].direction).toBe("out");
    expect(entries[0].counterSymbol).toBe("USDC");
  });

  it("calls it a swap when no side is money", () => {
    const entries = buildActivityEntries([
      transfer({ symbol: "ETH", direction: "out" }),
      transfer({ symbol: "GLDx", direction: "in" }),
    ]);
    expect(entries[0].kind).toBe("swapped");
  });

  it("names a lone stablecoin movement a deposit or a withdrawal", () => {
    expect(buildActivityEntries([transfer({ symbol: "USDC", direction: "in" })])[0].kind).toBe(
      "deposited"
    );
    expect(buildActivityEntries([transfer({ symbol: "USDC", direction: "out" })])[0].kind).toBe(
      "withdrew"
    );
  });

  it("keeps received and sent for everything else", () => {
    expect(buildActivityEntries([transfer({ symbol: "SOL", direction: "in" })])[0].kind).toBe(
      "received"
    );
    expect(buildActivityEntries([transfer({ symbol: "SOL", direction: "out" })])[0].kind).toBe(
      "sent"
    );
  });

  it("reads money out on one chain and an asset in on another as one purchase", () => {
    // A shared hash across chains never merges by itself (grouping is per
    // network:hash), but money leaving Base while an asset arrives on Solana
    // moments later is one cross-chain purchase, and reads as one.
    const entries = buildActivityEntries([
      transfer({ symbol: "USDC", direction: "out", network: "base-mainnet" }),
      transfer({ symbol: "GLDx", direction: "in", network: "solana-mainnet" }),
    ]);
    expect(entries).toHaveLength(1);
    expect(entries[0].kind).toBe("bought");
    expect(entries[0].symbol).toBe("GLDx");
    expect(entries[0].counterSymbol).toBe("USDC");
  });

  it("does not read a same-asset in-and-out as a trade", () => {
    // A routed hop can touch the wallet twice in the same asset; that is a
    // movement, not a purchase of USDC with USDC.
    const entries = buildActivityEntries([
      transfer({ symbol: "USDC", direction: "out", amount: 5 }),
      transfer({ symbol: "USDC", direction: "in", amount: 4.9 }),
    ]);
    expect(entries).toHaveLength(2);
    expect(entries.every((e) => e.kind === "withdrew" || e.kind === "deposited")).toBe(true);
  });

  it("picks the largest leg when a swap routes through several hops", () => {
    const entries = buildActivityEntries([
      transfer({ symbol: "USDC", direction: "out", amount: 0.01 }),
      transfer({ symbol: "USDC", direction: "out", amount: 2.88 }),
      transfer({ symbol: "GLDx", direction: "in", amount: 0.0077 }),
    ]);
    expect(entries).toHaveLength(1);
    expect(entries[0].counterAmount).toBe(2.88);
  });

  it("carries the traded asset's own logo, not the money's", () => {
    // The row renders this; without it GLDx and PRCL showed no icon at all.
    const entries = buildActivityEntries([
      transfer({ symbol: "USDC", direction: "out", amount: 2.88, logo: null }),
      transfer({
        symbol: "GLDx",
        direction: "in",
        amount: 0.0077,
        logo: "/api/token-logo/solana/Xsv9",
      }),
    ]);
    expect(entries[0].logo).toBe("/api/token-logo/solana/Xsv9");
  });

  it("orders newest first", () => {
    const entries = buildActivityEntries([
      transfer({ symbol: "SOL", direction: "in", hash: "0x1", timestamp: 1 }),
      transfer({ symbol: "SOL", direction: "in", hash: "0x2", timestamp: 9 }),
    ]);
    expect(entries[0].timestamp).toBe(9);
  });
});

describe("dust", () => {
  it("drops a stablecoin movement worth less than a cent", () => {
    // The refund a Dextopus settlement hands back after a withdrawal: real,
    // and worthless, and it read as "Deposited USDC +0" in the feed and the
    // bell after every single withdrawal.
    const entries = buildActivityEntries([
      transfer({ hash: "0x1", symbol: "USDC", direction: "out", amount: 20 }),
      transfer({ hash: "0x2", symbol: "USDC", direction: "in", amount: 0.00003 }),
      transfer({ hash: "0x3", symbol: "USDC", direction: "in", amount: 0.0001 }),
    ]);
    expect(entries.map((e) => [e.kind, e.amount])).toEqual([["withdrew", 20]]);
  });

  it("keeps a cent, and keeps small amounts of anything that is not money", () => {
    const entries = buildActivityEntries([
      transfer({ hash: "0x1", symbol: "USDC", direction: "in", amount: 0.01 }),
      transfer({ hash: "0x2", symbol: "SOL", direction: "in", amount: 0.000001 }),
    ]);
    expect(entries.map((e) => e.kind).sort()).toEqual(["deposited", "received"]);
  });

  it("does not break a trade apart over a dust leg", () => {
    // A buy's own transaction can carry a rounding remainder of USDC back in;
    // the trade still reads as one buy.
    const entries = buildActivityEntries([
      transfer({ hash: "0x9", symbol: "USDC", direction: "out", amount: 50 }),
      transfer({ hash: "0x9", symbol: "GLDx", direction: "in", amount: 0.5 }),
      transfer({ hash: "0x9", symbol: "USDC", direction: "in", amount: 0.000001 }),
    ]);
    expect(entries).toHaveLength(1);
    expect(entries[0].kind).toBe("bought");
  });
});

describe("isStable", () => {
  it("treats the money assets as money, case-insensitively", () => {
    expect(isStable("usdc")).toBe(true);
    expect(isStable("USDT")).toBe(true);
    expect(isStable("GLDx")).toBe(false);
    expect(isStable("SOL")).toBe(false);
  });
});

describe("cross-chain moves are not withdrawals", () => {
  it("names a transfer into the bridge router a move", () => {
    // The two 1:35/1:36 AM legs that funded a Solana purchase read as
    // "Withdrew USDC to 0x1231…4eae", as if the money had left the platform.
    const entries = buildActivityEntries([
      transfer({
        symbol: "USDC",
        direction: "out",
        network: "base-mainnet",
        amount: 3.06,
        counterparty: "0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae",
      }),
    ]);
    expect(entries[0].kind).toBe("moved");
  });

  it("matches the router regardless of address casing", () => {
    const entries = buildActivityEntries([
      transfer({
        symbol: "USDC",
        direction: "out",
        network: "base-mainnet",
        counterparty: "0x1231DEB6F5749EF6CE6943A275A1D3E7486F4EAE",
      }),
    ]);
    expect(entries[0].kind).toBe("moved");
  });

  it("still calls a real external send a withdrawal", () => {
    const entries = buildActivityEntries([
      transfer({
        symbol: "USDC",
        direction: "out",
        network: "base-mainnet",
        counterparty: "0xf70da978aaa61c7a4c48f0e0b0f0b6b9a4b1c2d3",
      }),
    ]);
    expect(entries[0].kind).toBe("withdrew");
  });
});
