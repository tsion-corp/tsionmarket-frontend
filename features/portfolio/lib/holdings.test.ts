import { describe, expect, it } from "vitest";
import { isDepositSettlementToken, selectHoldings } from "@/features/portfolio/lib/holdings";
import type { TokenBalance } from "@/lib/server/alchemy";

// Minimal TokenBalance factory. Only the fields the holdings filter reads
// (symbol, network) need to be meaningful; the rest carry placeholder values.
function token(overrides: Partial<TokenBalance>): TokenBalance {
  return {
    symbol: "USDC",
    name: "USD Coin",
    network: "base-mainnet",
    address: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
    decimals: 6,
    kind: "stablecoin",
    balance: 100,
    rawBalance: "100000000",
    priceUsd: 1,
    valueUsd: 100,
    logo: null,
    ...overrides,
  };
}

describe("isDepositSettlementToken", () => {
  it("matches USDC on Base", () => {
    expect(isDepositSettlementToken(token({ symbol: "USDC", network: "base-mainnet" }))).toBe(true);
  });

  it("does not match USDT on Base", () => {
    expect(isDepositSettlementToken(token({ symbol: "USDT", network: "base-mainnet" }))).toBe(
      false
    );
  });

  it("does not match USDC on another chain", () => {
    expect(isDepositSettlementToken(token({ symbol: "USDC", network: "arb-mainnet" }))).toBe(false);
  });

  it("does not match native ETH on Base", () => {
    expect(
      isDepositSettlementToken(token({ symbol: "ETH", network: "base-mainnet", address: null }))
    ).toBe(false);
  });
});

describe("selectHoldings", () => {
  it("removes the USDC-on-Base deposit float", () => {
    const tokens = [
      token({ symbol: "USDC", network: "base-mainnet" }),
      token({ symbol: "USDT", network: "base-mainnet" }),
    ];
    expect(selectHoldings(tokens).map((t) => t.symbol)).toEqual(["USDT"]);
  });

  it("keeps bought assets: USDT, RWA, native gas, and non-Base USDC", () => {
    const tokens = [
      token({ symbol: "USDC", network: "base-mainnet" }), // hidden
      token({ symbol: "USDT", network: "base-mainnet" }),
      token({ symbol: "cbBTC", network: "base-mainnet" }),
      token({ symbol: "OUSG", network: "base-mainnet" }),
      token({ symbol: "ETH", network: "base-mainnet", address: null }),
      token({ symbol: "USDC", network: "polygon-mainnet" }), // Base-only rule keeps this
    ];
    expect(selectHoldings(tokens).map((t) => t.symbol)).toEqual([
      "USDT",
      "cbBTC",
      "OUSG",
      "ETH",
      "USDC",
    ]);
  });

  it("returns an empty array for empty input", () => {
    expect(selectHoldings([])).toEqual([]);
  });

  it("does not mutate the input array", () => {
    const tokens = [token({ symbol: "USDC", network: "base-mainnet" })];
    selectHoldings(tokens);
    expect(tokens).toHaveLength(1);
  });
});
