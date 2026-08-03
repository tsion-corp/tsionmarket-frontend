import { describe, expect, it } from "vitest";
import {
  assetLiquidityUsd,
  formatChange,
  mergeMarket,
  type RwaMarketStats,
} from "@/lib/rwa/presenter";
import type { RwaApiAsset } from "@/lib/rwa-api";

function asset(overrides: Partial<RwaApiAsset>): RwaApiAsset {
  return {
    id: "solana:So1",
    chain: "solana",
    address: "So1",
    symbol: "TSLAx",
    name: "Tesla xStock",
    issuer: "Backed",
    category: "equity",
    priceUsd: null,
    freelyTradable: true,
    ...overrides,
  } as RwaApiAsset;
}

function market(overrides: Partial<RwaMarketStats> = {}): Map<string, RwaMarketStats> {
  return new Map([["solana:So1", { priceUsd: 312.5, ...overrides }]]);
}

describe("mergeMarket", () => {
  it("fills a missing price from the market lookup", () => {
    const merged = mergeMarket([asset({})], market());
    expect(merged[0].priceUsd).toBe("312.5");
  });

  it("never overrides a price the backend provided", () => {
    const merged = mergeMarket([asset({ priceUsd: "100" })], market());
    expect(merged[0].priceUsd).toBe("100");
  });

  it("attaches the stats even when the backend already priced the asset", () => {
    const merged = mergeMarket(
      [asset({ priceUsd: "100" })],
      market({ change24h: 1.86, liquidityUsd: 833_574 })
    );
    expect(merged[0].market?.change24h).toBe(1.86);
    expect(assetLiquidityUsd(merged[0])).toBe(833_574);
  });

  it("keeps assets untouched when the lookup is empty", () => {
    const input = [asset({})];
    const merged = mergeMarket(input, new Map());
    expect(merged).toBe(input);
    expect(merged[0].priceUsd).toBeNull();
  });
});

describe("formatChange", () => {
  it("signs both directions and keeps zero as a real reading", () => {
    expect(formatChange(1.858)).toBe("+1.86%");
    expect(formatChange(-0.054)).toBe("-0.05%");
    expect(formatChange(0)).toBe("+0.00%");
  });

  it("returns null when there is no reading", () => {
    expect(formatChange(undefined)).toBeNull();
    expect(formatChange(Number.NaN)).toBeNull();
  });
});
