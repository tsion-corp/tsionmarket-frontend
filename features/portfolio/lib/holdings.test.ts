import { describe, expect, it } from "vitest";
import {
  isDepositSettlementToken,
  isDustHolding,
  isUnpricedHolding,
  isZeroValueHolding,
  memeTokenOf,
  selectHoldings,
  withoutServiceKnownMemes,
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

/**
 * The rule that keeps "<$0.01" out of the holdings list.
 *
 * It mirrors formatMoney's own condition for printing "<$0.01" in place of a
 * figure, so what it hides is exactly what could not be shown as a number.
 */
describe("isDustHolding", () => {
  it("hides a position that can only render as a sub-cent figure", () => {
    // The reported case: a full exit that left a remainder behind.
    expect(isDustHolding(token({ balance: 0.0042, priceUsd: 1, valueUsd: 0.0042 }))).toBe(true);
    expect(isDustHolding(token({ balance: 0.5, priceUsd: 0.001, valueUsd: 0.0005 }))).toBe(true);
  });

  it("keeps anything from a cent upward, including exactly a cent", () => {
    expect(isDustHolding(token({ valueUsd: 0.01 }))).toBe(false);
    expect(isDustHolding(token({ valueUsd: 0.05 }))).toBe(false);
    expect(isDustHolding(token({ valueUsd: 240 }))).toBe(false);
  });

  /**
   * valueUsd is balance x price, so a real balance we could not price is $0
   * through no fault of the owner. It renders "$0.00", which is a figure, and
   * hiding it would say they do not hold something they do.
   */
  it("keeps a real balance we could not price", () => {
    expect(isDustHolding(token({ balance: 4, priceUsd: 0, valueUsd: 0 }))).toBe(false);
  });

  /**
   * One wei of ETH is genuinely held however the float rounds it, and the
   * holdings modal has its own test saying so. Zero is not dust.
   */
  it("keeps a balance too small for the float to carry", () => {
    expect(isDustHolding(token({ balance: 1e-18, rawBalance: "1", valueUsd: 0 }))).toBe(false);
  });

  /**
   * The distinction from isZeroValueHolding, which the holdings table's toggle
   * uses. That one asks "does this round to $0.00"; this one asks "can this be
   * shown as a figure at all". A $0.007 position rounds up to a cent, so the
   * table keeps it, while the list still could not print it.
   */
  it("is stricter than the table's zero-value rule", () => {
    const barelyThere = token({ balance: 0.007, priceUsd: 1, valueUsd: 0.007 });
    expect(isZeroValueHolding(barelyThere)).toBe(false);
    expect(isDustHolding(barelyThere)).toBe(true);
  });
});

/**
 * Gas is meant to be invisible on this platform. Where it cannot be sponsored,
 * a holding the wallet cannot pay the fee to move is not offered for sale at
 * all, rather than failing halfway through one. Reported from staging on
 * 2026-09-12: a USD₮0 sale on HyperEVM.
 */
describe("selectHoldings on unsponsored chains", () => {
  const usdt0 = token({
    symbol: "USD₮0",
    network: "hyperliquid-mainnet",
    address: "0xb8ce59fc3717ada4c02eadf9682a9e934f625ebb",
  });
  const hype = token({ symbol: "HYPE", network: "hyperliquid-mainnet", address: null });

  it("hides a token on an unsponsored chain when the wallet holds no gas coin", () => {
    expect(selectHoldings([usdt0, { ...hype, balance: 0, rawBalance: "0" }])).toEqual([]);
  });

  it("keeps it once the wallet holds the chain's own coin", () => {
    expect(selectHoldings([usdt0, hype])).toEqual([usdt0, hype]);
  });

  it("keeps sponsored-chain holdings with no native balance", () => {
    const usdt = token({ symbol: "USDT", network: "base-mainnet" });
    expect(selectHoldings([usdt])).toEqual([usdt]);
  });

  it("keeps Solana holdings with no SOL, since its sends are sponsored too", () => {
    const bonk = token({ symbol: "BONK", network: "solana-mainnet", address: "Bonk111" });
    expect(selectHoldings([bonk])).toEqual([bonk]);
  });
});

// A real balance with no price: the holdings list says "Valuation unavailable"
// for it rather than "$0.00". Judged on the exact base units, not the float.
describe("isUnpricedHolding", () => {
  it("is a held balance whose price is unknown", () => {
    expect(
      isUnpricedHolding(token({ balance: 4, rawBalance: "4000000", priceUsd: 0, valueUsd: 0 }))
    ).toBe(true);
  });

  it("is not a priced holding, and not an empty baseline row", () => {
    expect(isUnpricedHolding(token({}))).toBe(false);
    expect(
      isUnpricedHolding(token({ balance: 0, rawBalance: "0", priceUsd: 0, valueUsd: 0 }))
    ).toBe(false);
  });
});

// A held catalogue memecoin as the trade sheet's token. It hard-coded Base's
// 8453 for every meme, so a Solana coin opened the sheet on the wrong chain.
describe("memeTokenOf", () => {
  const MINT = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263";

  it("takes the chain from the holding's network", () => {
    const pepe = token({
      symbol: "PEPE",
      network: "base-mainnet",
      address: "0xpepe",
      meme: true,
      priceUsd: 0.5,
    });
    expect(memeTokenOf(pepe)).toMatchObject({ chainId: 8453, address: "0xpepe", priceUsd: "0.5" });

    const bonk = token({ symbol: "BONK", network: "solana-mainnet", address: MINT, meme: true });
    expect(memeTokenOf(bonk)).toMatchObject({ chainId: 101, address: MINT });
  });

  it('leaves an unpriced holding\'s price null, never "0"', () => {
    const held = token({
      network: "base-mainnet",
      address: "0xabc",
      meme: true,
      priceUsd: 0,
      valueUsd: 0,
    });
    expect(memeTokenOf(held)?.priceUsd).toBeNull();
  });

  it("is null for a holding that is not a trade-service meme on a chain it executes on", () => {
    expect(memeTokenOf(token({ meme: false }))).toBeNull();
    expect(memeTokenOf(token({ meme: true, address: null }))).toBeNull();
    expect(memeTokenOf(token({ meme: true, network: "eth-mainnet", address: "0xabc" }))).toBeNull();
  });
});

// The service's /portfolio is the record of memes bought through it, with
// cost basis and P&L; the Memecoins section shows those. The generic holdings
// table keeps only the balances the service does not know (an airdrop, a
// transfer in), so a coin is never listed twice with two different values.
describe("withoutServiceKnownMemes", () => {
  const MINT = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263";
  const pepe = token({ symbol: "PEPE", network: "base-mainnet", address: "0xAbCd", meme: true });
  const bonk = token({ symbol: "BONK", network: "solana-mainnet", address: MINT });
  const airdrop = token({ symbol: "DROP", network: "base-mainnet", address: "0xd70p", meme: true });
  const usdc = token({});

  it("drops a holding the service has a position for, EVM case-insensitively", () => {
    const rows = withoutServiceKnownMemes(
      [pepe, airdrop, usdc],
      [{ chainId: 8453, address: "0xabcd" }]
    );
    expect(rows).toEqual([airdrop, usdc]);
  });

  it("matches a Solana mint exactly as written", () => {
    expect(withoutServiceKnownMemes([bonk], [{ chainId: 101, address: MINT }])).toEqual([]);
    expect(
      withoutServiceKnownMemes([bonk], [{ chainId: 101, address: MINT.toLowerCase() }])
    ).toEqual([bonk]);
  });

  it("never drops the same address on another chain", () => {
    expect(withoutServiceKnownMemes([pepe], [{ chainId: 101, address: "0xAbCd" }])).toEqual([pepe]);
  });

  it("keeps everything while the service's positions are unknown", () => {
    expect(withoutServiceKnownMemes([pepe, usdc], [])).toEqual([pepe, usdc]);
  });
});
