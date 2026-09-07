import { describe, expect, it } from "vitest";
import { gasBufferFor, maxSellable } from "@/lib/trade/gas-buffer";

describe("gasBufferFor", () => {
  it("reserves nothing for Dextopus's direct sponsored SOL transfer", () => {
    expect(gasBufferFor("solana-mainnet", null)).toBe(0);
  });

  // One paymaster policy is enabled on every mainnet the app can reach
  // (ADR-2026-09-07-sponsor-all-evm-mainnets), so a full-balance sell of the
  // native token on any of them can pay for itself.
  it("reserves nothing on the sponsored mainnets", () => {
    expect(gasBufferFor("base-mainnet", null)).toBe(0);
    expect(gasBufferFor("polygon-mainnet", null)).toBe(0);
    expect(gasBufferFor("eth-mainnet", null, 1)).toBe(0);
    expect(gasBufferFor("arb-mainnet", null, 1)).toBe(0);
    expect(gasBufferFor("hyperliquid-mainnet", null, 5)).toBe(0);
  });

  // Being in the sponsorship registry is not the same as having a policy: a
  // testnet, or a mainnet the API key cannot reach, sends user-paid, and the
  // fee has to come out of the same native balance.
  it("reserves gas on registry chains that hold no policy", () => {
    expect(gasBufferFor("arbnova-mainnet", null, 1)).toBeCloseTo(0.01, 8);
    expect(gasBufferFor("eth-sepolia", null, 1)).toBeCloseTo(0.01, 8);
  });

  it("still holds back a share on a chain nobody has sized", () => {
    expect(gasBufferFor("madeup-mainnet", null, 1)).toBeCloseTo(0.01, 8);
  });

  it("reserves nothing for contract tokens, whose gas is paid in the native asset", () => {
    expect(gasBufferFor("eth-mainnet", "0x1234000000000000000000000000000000000000")).toBe(0);
    expect(gasBufferFor("solana-mainnet", "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v")).toBe(0);
  });

  it("reserves nothing on unknown networks", () => {
    expect(gasBufferFor("unknown-mainnet", null)).toBe(0);
  });
});

describe("maxSellable", () => {
  it("keeps the full native SOL balance for the primary Dextopus rail", () => {
    expect(maxSellable("solana-mainnet", null, 1)).toBe(1);
  });

  it("keeps the full native balance where a gas policy covers the send", () => {
    expect(maxSellable("base-mainnet", null, 1)).toBe(1);
    expect(maxSellable("polygon-mainnet", null, 1)).toBe(1);
  });

  // A max fill on a chain with no policy has to leave the fee behind, or the
  // send is rejected for want of gas. HyperEVM, where this was first reported,
  // is sponsored now, so its full balance sells; an unreachable mainnet keeps
  // the reserve.
  it("leaves gas behind on a max native sell without a policy", () => {
    expect(maxSellable("hyperliquid-mainnet", null, 0.747158265771075558)).toBe(
      0.747158265771075558
    );
    expect(maxSellable("arbnova-mainnet", null, 1)).toBeLessThan(1);
    expect(maxSellable("arbnova-mainnet", null, 1)).toBeCloseTo(0.99, 9);
  });

  it("keeps the full balance for contract tokens", () => {
    expect(maxSellable("eth-mainnet", "0x1234000000000000000000000000000000000000", 5)).toBe(5);
    expect(
      maxSellable("hyperliquid-mainnet", "0x1234000000000000000000000000000000000000", 5)
    ).toBe(5);
  });

  it("never goes below zero", () => {
    expect(maxSellable("solana-mainnet", null, 0)).toBe(0);
  });
});
