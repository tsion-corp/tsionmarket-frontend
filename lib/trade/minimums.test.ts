import { describe, expect, it } from "vitest";
import { SOLANA_CHAIN_ID } from "@/lib/deposit";
import {
  belowMinimumBuy,
  isSolanaChainId,
  minimumBuyUsd,
  SOLANA_MIN_BUY_USD,
} from "@/lib/trade/minimums";

describe("minimum buy", () => {
  it("is 2 USDC on Solana and 1 elsewhere", () => {
    expect(minimumBuyUsd(true)).toBe(2);
    expect(minimumBuyUsd(false)).toBe(1);
    expect(SOLANA_MIN_BUY_USD).toBe(2);
  });

  it("flags a Solana buy under 2 and lets 2 through", () => {
    expect(belowMinimumBuy(1.99, true)).toBe(true);
    expect(belowMinimumBuy(2, true)).toBe(false);
    // The same 1.5 is fine on Base.
    expect(belowMinimumBuy(1.5, false)).toBe(false);
    expect(belowMinimumBuy(0.5, false)).toBe(true);
  });

  it("does not flag an empty field", () => {
    expect(belowMinimumBuy(0, true)).toBe(false);
  });

  it("recognises Dextopus's Solana chain id", () => {
    expect(isSolanaChainId(SOLANA_CHAIN_ID)).toBe(true);
    expect(isSolanaChainId(8453)).toBe(false);
    expect(isSolanaChainId(null)).toBe(false);
  });
});
