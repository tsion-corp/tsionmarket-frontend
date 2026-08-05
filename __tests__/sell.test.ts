import { describe, expect, it } from "vitest";
import { buildSellQuoteBody, canSell, canSellAsset, SELL_DESTINATION } from "@/lib/sell";

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

  it("rejects an unsupported network", () => {
    expect(canSell("bnb-mainnet")).toBe(false);
  });
});

describe("canSellAsset", () => {
  it("allows tokens (with an address) on supported chains", () => {
    expect(canSellAsset("polygon-mainnet", "0xusdc")).toBe(true);
    expect(canSellAsset("solana-mainnet", "somemint")).toBe(true);
  });

  it("allows native ETH and native SOL but not native POL", () => {
    expect(canSellAsset("base-mainnet", null)).toBe(true);
    expect(canSellAsset("eth-mainnet", null)).toBe(true);
    expect(canSellAsset("arb-mainnet", null)).toBe(true);
    expect(canSellAsset("polygon-mainnet", null)).toBe(false);
    // Native SOL sells via a single sponsored LI.FI leg straight to USDC on
    // Base — LI.FI takes SOL as an origin where Dextopus does not.
    expect(canSellAsset("solana-mainnet", null)).toBe(true);
  });

  it("rejects everything on an unsupported network", () => {
    expect(canSellAsset("bnb-mainnet", "0xtoken")).toBe(false);
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

  it("uses the wrapped-SOL mint for native SOL", () => {
    const body = buildSellQuoteBody({
      network: "solana-mainnet",
      asset: null,
      amount: 1n,
      recipient: "0xb",
      refundTo: "solwallet",
      slippageBps: 100,
    });
    expect(body.originAsset).toBe("So11111111111111111111111111111111111111112");
    expect(body.originChainId).toBe(792703809);
  });

  it("throws for an unsupported network", () => {
    expect(() =>
      buildSellQuoteBody({
        network: "bnb-mainnet",
        asset: "0x",
        amount: 1n,
        recipient: "0x",
        refundTo: "0x",
        slippageBps: 100,
      })
    ).toThrow();
  });
});
