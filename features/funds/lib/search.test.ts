import { describe, expect, it } from "vitest";
import { filterChains, filterTokens } from "@/features/funds/lib/search";

const tokens = [
  { symbol: "USDC", name: "USD Coin" },
  { symbol: "ETH", name: "Ether" },
  { symbol: "cbBTC", name: "Coinbase Wrapped BTC" },
];
const chains = [{ name: "Base" }, { name: "Ethereum" }, { name: "Arbitrum" }];

describe("funding search", () => {
  it("matches a token by ticker, whatever the case", () => {
    expect(filterTokens(tokens, "eth").map((t) => t.symbol)).toEqual(["ETH"]);
  });

  it("matches a token by name", () => {
    expect(filterTokens(tokens, "wrapped").map((t) => t.symbol)).toEqual(["cbBTC"]);
  });

  it("keeps everything for an empty or blank query", () => {
    expect(filterTokens(tokens, "   ")).toHaveLength(3);
    expect(filterChains(chains, "")).toHaveLength(3);
  });

  it("matches a network by name", () => {
    expect(filterChains(chains, "ARB").map((c) => c.name)).toEqual(["Arbitrum"]);
  });

  it("returns nothing when nothing matches", () => {
    expect(filterTokens(tokens, "doge")).toEqual([]);
  });
});
