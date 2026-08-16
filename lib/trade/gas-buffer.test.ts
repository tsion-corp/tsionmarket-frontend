import { describe, expect, it } from "vitest";
import {
  gasBufferFor,
  maxLifiNativeSolSellable,
  maxSellable,
  SOLANA_LIFI_RESERVE_LAMPORTS,
} from "@/lib/trade/gas-buffer";

describe("gasBufferFor", () => {
  it("reserves nothing for Dextopus's direct sponsored SOL transfer", () => {
    expect(gasBufferFor("solana-mainnet", null)).toBe(0);
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
  it("keeps the full native SOL balance for the primary Dextopus rail", () => {
    expect(maxSellable("solana-mainnet", null, 1)).toBe(1);
  });

  it("keeps the full native balance on sponsored EVM chains", () => {
    expect(maxSellable("eth-mainnet", null, 1)).toBe(1);
    expect(maxSellable("base-mainnet", null, 1)).toBe(1);
  });

  it("keeps the full balance for contract tokens", () => {
    expect(maxSellable("eth-mainnet", "0x1234000000000000000000000000000000000000", 5)).toBe(5);
  });

  it("never goes below zero", () => {
    expect(maxSellable("solana-mainnet", null, 0)).toBe(0);
  });
});

describe("maxLifiNativeSolSellable", () => {
  it("holds back wrap rent only when the LI.FI fallback is selected", () => {
    expect(maxLifiNativeSolSellable(10_000_000n)).toBe(10_000_000n - SOLANA_LIFI_RESERVE_LAMPORTS);
  });

  it("returns zero when the balance cannot cover the wrap reserve", () => {
    expect(maxLifiNativeSolSellable(SOLANA_LIFI_RESERVE_LAMPORTS)).toBe(0n);
    expect(maxLifiNativeSolSellable(1n)).toBe(0n);
  });
});
