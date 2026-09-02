import { describe, expect, it } from "vitest";
import { gasBufferFor, maxSellable } from "@/lib/trade/gas-buffer";

describe("gasBufferFor", () => {
  it("reserves nothing for Dextopus's direct sponsored SOL transfer", () => {
    expect(gasBufferFor("solana-mainnet", null)).toBe(0);
  });

  it("reserves nothing on the chains that hold a gas policy", () => {
    expect(gasBufferFor("base-mainnet", null)).toBe(0);
    expect(gasBufferFor("polygon-mainnet", null)).toBe(0);
  });

  // Being in the sponsorship registry is not the same as having a policy: with
  // no policy the bundler rejects the userOp, the send falls back to the user
  // paying, and the fee has to come out of the same native balance.
  it("reserves gas on registry chains that hold no policy", () => {
    expect(gasBufferFor("eth-mainnet", null, 1)).toBe(0.0003);
    expect(gasBufferFor("arb-mainnet", null, 1)).toBe(0.0003);
  });

  it("holds back a share of the balance on a chain nobody has sized", () => {
    expect(gasBufferFor("hyperliquid-mainnet", null, 0.747158265771075558)).toBeCloseTo(
      0.00747158,
      8
    );
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

  // The reported HYPE sell: a max fill on a chain with no policy has to leave
  // the fee behind, or the send is rejected for want of gas.
  it("leaves gas behind on a max native sell without a policy", () => {
    expect(maxSellable("hyperliquid-mainnet", null, 0.747158265771075558)).toBeLessThan(
      0.747158265771075558
    );
    expect(maxSellable("hyperliquid-mainnet", null, 0.747158265771075558)).toBeGreaterThan(0.7);
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
