import { describe, expect, it } from "vitest";
import { buyFunding, estimateReceive, usdcFromRaw } from "@/lib/meme/funding";
import { BASE_CHAIN_ID, SOLANA_CHAIN_ID } from "@/lib/meme/chain";

// The user has one USD balance. Where it sits is the app's problem: a Solana
// coin is bought with Base USDC moved across first, and the sheet must say
// what is spendable and whether a move is needed, never which chain.
describe("buyFunding", () => {
  it("spends Base USDC directly on a Base coin", () => {
    const f = buyFunding({ chainId: BASE_CHAIN_ID, payUsd: 5, baseUsdc: 7, solanaUsdc: 0 });
    expect(f.spendableUsd).toBe(7);
    expect(f.needsFunding).toBe(false);
    expect(f.fundingUsd).toBe(0);
  });

  it("counts Base USDC as spendable on a Solana coin and moves the shortfall", () => {
    const f = buyFunding({ chainId: SOLANA_CHAIN_ID, payUsd: 5, baseUsdc: 7, solanaUsdc: 0 });
    expect(f.spendableUsd).toBe(7);
    expect(f.needsFunding).toBe(true);
    expect(f.fundingUsd).toBe(5);
    expect(f.canFund).toBe(true);
  });

  it("moves at least the Solana floor when the shortfall is tiny", () => {
    const f = buyFunding({ chainId: SOLANA_CHAIN_ID, payUsd: 3, baseUsdc: 7, solanaUsdc: 2.5 });
    expect(f.needsFunding).toBe(true);
    expect(f.fundingUsd).toBe(2);
  });

  it("needs no move when Solana USDC already covers the buy", () => {
    const f = buyFunding({ chainId: SOLANA_CHAIN_ID, payUsd: 3, baseUsdc: 0, solanaUsdc: 5 });
    expect(f.needsFunding).toBe(false);
    expect(f.spendableUsd).toBe(5);
  });

  it("cannot fund when Base USDC is short of the move", () => {
    const f = buyFunding({ chainId: SOLANA_CHAIN_ID, payUsd: 5, baseUsdc: 1, solanaUsdc: 0 });
    expect(f.needsFunding).toBe(true);
    expect(f.canFund).toBe(false);
    expect(f.spendableUsd).toBe(1);
  });
});

describe("estimateReceive", () => {
  it("divides the dollars by the listed price", () => {
    expect(estimateReceive(2, "0.5")).toBe(4);
  });
  it("has no estimate without a price", () => {
    expect(estimateReceive(2, null)).toBeNull();
    expect(estimateReceive(2, "0")).toBeNull();
  });
});

describe("usdcFromRaw", () => {
  it("formats atomic USDC as a six-decimal human amount without floats", () => {
    expect(usdcFromRaw(1_234_567n)).toBe("1.234567");
    expect(usdcFromRaw(2_000_000n)).toBe("2");
    expect(usdcFromRaw(5n)).toBe("0.000005");
  });
});
