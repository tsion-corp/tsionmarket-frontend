import { describe, expect, it } from "vitest";
import { buildSellQuoteBody, canSell, canSellAsset, SELL_DESTINATION } from "@/lib/sell";
import { CONTRACTS } from "@/lib/polymarket/config";

const USDC_BASE = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";

describe("SELL_DESTINATION", () => {
  it("is USDC on Base with 6 decimals", () => {
    expect(SELL_DESTINATION.chainId).toBe(8453);
    expect(SELL_DESTINATION.decimals).toBe(6);
    expect(SELL_DESTINATION.asset.toLowerCase()).toBe(USDC_BASE);
  });
});

describe("canSell", () => {
  it("accepts supported networks", () => {
    expect(canSell("base-mainnet")).toBe(true);
    expect(canSell("arb-mainnet")).toBe(true);
    expect(canSell("solana-mainnet")).toBe(true);
  });

  it("accepts the chains added alongside spot's expanded buy list", () => {
    expect(canSell("bnb-mainnet")).toBe(true);
    expect(canSell("berachain-mainnet")).toBe(true);
  });

  it("rejects a network not in either list", () => {
    expect(canSell("fantom-mainnet")).toBe(false);
  });
});

describe("canSellAsset", () => {
  it("allows tokens (with an address) on supported chains", () => {
    expect(canSellAsset("polygon-mainnet", "0xusdc")).toBe(true);
    expect(canSellAsset("solana-mainnet", "somemint")).toBe(true);
    // A token is assumed sellable on a new chain even where the chain's own
    // native balance is not (berachain's native BERA is not, but its ERC-20s
    // still are, per Dextopus's own quote endpoint).
    expect(canSellAsset("berachain-mainnet", "0xsometoken")).toBe(true);
  });

  it("allows native ETH and native SOL but not native POL", () => {
    expect(canSellAsset("base-mainnet", null)).toBe(true);
    expect(canSellAsset("eth-mainnet", null)).toBe(true);
    expect(canSellAsset("arb-mainnet", null)).toBe(true);
    expect(canSellAsset("polygon-mainnet", null)).toBe(false);
    // Native SOL uses a direct sponsored Dextopus deposit.
    expect(canSellAsset("solana-mainnet", null)).toBe(true);
  });

  it("allows native BNB, confirmed live against Dextopus's own quote endpoint", () => {
    expect(canSellAsset("bnb-mainnet", null)).toBe(true);
  });

  it("rejects native balances Dextopus does not accept as a sell origin, even though the chain itself is supported", () => {
    // Confirmed live: Dextopus rejects a native origin on these four chains
    // specifically ("Origin asset ... is not supported" / no route at all).
    expect(canSellAsset("berachain-mainnet", null)).toBe(false);
    expect(canSellAsset("celo-mainnet", null)).toBe(false);
    expect(canSellAsset("gnosis-mainnet", null)).toBe(false);
    expect(canSellAsset("avax-mainnet", null)).toBe(false);
  });

  it("rejects everything on an unsupported network", () => {
    expect(canSellAsset("fantom-mainnet", "0xtoken")).toBe(false);
  });

  it("routes Polygon pUSD through Prediction cash-out instead of generic sell", () => {
    expect(canSellAsset("polygon-mainnet", CONTRACTS.pusd)).toBe(false);
    expect(canSellAsset("polygon-mainnet", CONTRACTS.pusd.toLowerCase())).toBe(false);
  });
});

describe("buildSellQuoteBody", () => {
  it("routes a held ERC-20 to USDC on Base", () => {
    const body = buildSellQuoteBody({
      network: "arb-mainnet",
      asset: "0xtoken",
      amount: 1_500_000n,
      recipient: "0xbase",
      refundTo: "0xarb",
      slippageBps: 100,
    });
    expect(body).toEqual({
      originChainId: 42161,
      originAsset: "0xtoken",
      destinationChainId: 8453,
      destinationAsset: SELL_DESTINATION.asset,
      amount: "1500000",
      recipient: "0xbase",
      refundTo: "0xarb",
      slippageBps: 100,
      strict: true,
    });
  });

  it("uses the EVM native sentinel for a native EVM balance", () => {
    const body = buildSellQuoteBody({
      network: "base-mainnet",
      asset: null,
      amount: 1n,
      recipient: "0xb",
      refundTo: "0xb",
      slippageBps: 50,
    });
    expect(body.originAsset).toBe("0x0000000000000000000000000000000000000000");
    expect(body.originChainId).toBe(8453);
  });

  it("uses the system-program sentinel accepted by Dextopus for native SOL", () => {
    const body = buildSellQuoteBody({
      network: "solana-mainnet",
      asset: null,
      amount: 1n,
      recipient: "0xb",
      refundTo: "solwallet",
      slippageBps: 100,
    });
    expect(body.originAsset).toBe("11111111111111111111111111111111");
    expect(body.originChainId).toBe(792703809);
    expect(body.strict).toBe(true);
  });

  it("throws for an unsupported network", () => {
    expect(() =>
      buildSellQuoteBody({
        network: "fantom-mainnet",
        asset: "0x",
        amount: 1n,
        recipient: "0x",
        refundTo: "0x",
        slippageBps: 100,
      })
    ).toThrow();
  });
});
