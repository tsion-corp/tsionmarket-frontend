import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { fetchRwaMarket } = await import("@/lib/server/rwa-prices");
const { fetchTokenHistory } = await import("@/lib/server/token-history");

// Hits Jupiter, Alchemy and GeckoTerminal for real. Skipped unless RWA_LIVE=1,
// so CI never depends on a third party being up, but the shape stays verifiable.
const live = process.env.RWA_LIVE === "1" ? describe : describe.skip;

// The four assets that showed no chart or no stats in review.
const REGRESSIONS = [
  { id: "solana:nvdax", chain: "solana", address: "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh" },
  { id: "solana:usdy", chain: "solana", address: "A1KLoBrKBde8Ty9qtNQUtq3C2ortoC3u7twggz7sEto6" },
  { id: "solana:spyx", chain: "solana", address: "XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W" },
  { id: "base:syrup", chain: "base", address: "0x660975730059246A68521a3e2FBD4740173100f5" },
];

live("RWA market data (live upstreams)", () => {
  it("charts every asset that previously came back empty", async () => {
    for (const asset of REGRESSIONS) {
      const points = await fetchTokenHistory(asset.chain, asset.address);
      expect(points.length, `${asset.id} history`).toBeGreaterThan(24);
      // Duplicates and bad ordering are what the chart library throws on.
      const times = points.map((p) => p.time);
      expect(new Set(times).size, `${asset.id} duplicate times`).toBe(times.length);
      expect(times, `${asset.id} ordering`).toEqual([...times].sort((a, b) => a - b));
    }
  }, 40_000);

  it("prices and moves every live asset, on both chains", async () => {
    const out = await fetchRwaMarket(REGRESSIONS);
    for (const asset of REGRESSIONS) {
      expect(out[asset.id]?.priceUsd, `${asset.id} price`).toBeGreaterThan(0);
      expect(out[asset.id]?.change24h, `${asset.id} 24h`).toBeTypeOf("number");
    }
  }, 40_000);

  it("keeps prices when the keyless depth source is unavailable", async () => {
    // withDepth=false is the portfolio's path: no GeckoTerminal call at all.
    const out = await fetchRwaMarket(REGRESSIONS, false);
    for (const asset of REGRESSIONS) {
      expect(out[asset.id]?.priceUsd, `${asset.id} price`).toBeGreaterThan(0);
    }
  }, 40_000);
});
