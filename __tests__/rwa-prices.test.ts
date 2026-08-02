import { describe, expect, it } from "vitest";
import { mergeFallbackPrices } from "@/hooks/use-rwa-prices";
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

describe("mergeFallbackPrices", () => {
  it("fills a missing price from the fallback map", () => {
    const merged = mergeFallbackPrices([asset({})], new Map([["solana:So1", 312.5]]));
    expect(merged[0].priceUsd).toBe("312.5");
  });

  it("never overrides a price the backend provided", () => {
    const merged = mergeFallbackPrices(
      [asset({ priceUsd: "100" })],
      new Map([["solana:So1", 312.5]])
    );
    expect(merged[0].priceUsd).toBe("100");
  });

  it("keeps priceless assets untouched when the map has no entry", () => {
    const input = [asset({})];
    const merged = mergeFallbackPrices(input, new Map());
    expect(merged).toBe(input);
    expect(merged[0].priceUsd).toBeNull();
  });
});
