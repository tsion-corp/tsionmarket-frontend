import { describe, expect, it } from "vitest";
import {
  isDepositSettlementToken,
  isZeroValueHolding,
  selectHoldings,
} from "@/features/portfolio/lib/holdings";
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

describe("isZeroValueHolding", () => {
  it("hides the baseline rows the portfolio always adds at a zero balance", () => {
    expect(isZeroValueHolding(token({ balance: 0, priceUsd: 1, valueUsd: 0 }))).toBe(true);
  });

  it("hides dust that the table would render as $0.00", () => {
    expect(
      isZeroValueHolding(token({ balance: 0.000001, priceUsd: 2467, valueUsd: 0.002467 }))
    ).toBe(true);
  });

  it("keeps a real balance we could not price — the APE-on-ApeChain report", () => {
    const ape = token({
      symbol: "APE",
      network: "apechain-mainnet",
      address: null,
      kind: "coin",
      balance: 451.2,
      priceUsd: 0,
      valueUsd: 0,
    });
    expect(isZeroValueHolding(ape)).toBe(false);
  });

  it("keeps a real balance we could not price — the HYPE-on-HyperEVM report", () => {
    const hype = token({
      symbol: "HYPE",
      network: "hyperliquid-mainnet",
      address: null,
      kind: "coin",
      balance: 0.75,
      priceUsd: 0,
      valueUsd: 0,
    });
    expect(isZeroValueHolding(hype)).toBe(false);
  });

  it("keeps an ordinary priced holding", () => {
    expect(isZeroValueHolding(token({}))).toBe(false);
  });
});
