import { describe, expect, it } from "vitest";
import { gasBufferFor, maxSellable } from "@/lib/trade/gas-buffer";

describe("gasBufferFor", () => {
  it("reserves the wrap rent when selling native SOL", () => {
    // Fees are sponsored; the temporary wrapped-SOL account's rent deposit is
    // the seller's, so a Max sell must hold it back.
    expect(gasBufferFor("solana-mainnet", null)).toBeGreaterThan(0.002);
  });

  it("reserves nothing on sponsored EVM chains", () => {
    expect(gasBufferFor("eth-mainnet", null)).toBe(0);
    expect(gasBufferFor("arb-mainnet", null)).toBe(0);
    expect(gasBufferFor("opt-mainnet", null)).toBe(0);
    expect(gasBufferFor("polygon-mainnet", null)).toBe(0);
    expect(gasBufferFor("base-mainnet", null)).toBe(0);
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
  it("subtracts the wrap reserve from a native SOL balance", () => {
    const buffer = gasBufferFor("solana-mainnet", null);
    expect(maxSellable("solana-mainnet", null, 1)).toBeCloseTo(1 - buffer, 12);
  });

  it("keeps the full native balance on sponsored EVM chains", () => {
    expect(maxSellable("eth-mainnet", null, 1)).toBe(1);
    expect(maxSellable("base-mainnet", null, 1)).toBe(1);
  });

  it("keeps the full balance for contract tokens", () => {
    expect(maxSellable("eth-mainnet", "0x1234000000000000000000000000000000000000", 5)).toBe(5);
  });

  it("never goes below zero when the balance is under the reserve", () => {
    expect(maxSellable("solana-mainnet", null, 0.0001)).toBe(0);
    expect(maxSellable("solana-mainnet", null, 0)).toBe(0);
  });
});
