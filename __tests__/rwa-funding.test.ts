import { describe, expect, it } from "vitest";
import {
  GAS_TOPUP_USDC,
  LIFI_NATIVE_SOL,
  fundingLegs,
  planAffordable,
  planSignature,
  planSolanaFunding,
} from "@/lib/rwa/funding";

const base = { spendUsdc: 20, solanaUsdc: 0, solanaSol: 0, baseUsdc: 100 };

describe("planSolanaFunding", () => {
  it("needs nothing when Solana already holds the funds and gas", () => {
    expect(planSolanaFunding({ ...base, solanaUsdc: 25, solanaSol: 0.02 })).toBeNull();
  });

  it("sends more than the shortfall so the arrival covers it", () => {
    // A bridge delivers ~0.4-1% less than it takes; sending exactly 8 would
    // land short and leave the buy unaffordable.
    const plan = planSolanaFunding({ ...base, solanaUsdc: 12, solanaSol: 0.02 });
    expect(plan?.bridgeUsdc).toBeGreaterThan(8);
    expect(plan?.bridgeUsdc).toBeLessThanOrEqual(8.5);
    expect(plan?.topUpGas).toBe(false);
  });

  it("raises a dust hop to the minimum instead of bridging pennies", () => {
    // 4%+ of a $0.50 hop is lost to fees, and the arrival would still miss.
    const plan = planSolanaFunding({ ...base, spendUsdc: 20, solanaUsdc: 19.7, solanaSol: 0.02 });
    expect(plan?.bridgeUsdc).toBe(2);
  });

  it("rounds the bridged amount up to the cent", () => {
    const plan = planSolanaFunding({ ...base, spendUsdc: 100, solanaSol: 0.02 });
    expect(plan?.bridgeUsdc).toBe(102);
  });

  it("adds a gas top-up when SOL is short, even with enough USDC", () => {
    const plan = planSolanaFunding({ ...base, solanaUsdc: 50, solanaSol: 0 });
    expect(plan?.bridgeUsdc).toBe(0);
    expect(plan?.topUpGas).toBe(true);
    expect(plan?.totalBaseUsdc).toBe(GAS_TOPUP_USDC);
  });

  it("covers both when the wallet is empty", () => {
    const plan = planSolanaFunding(base);
    expect(plan?.totalBaseUsdc).toBe(20 * 1.02 + GAS_TOPUP_USDC);
  });
});

describe("planAffordable", () => {
  it("compares the whole plan against the Base balance", () => {
    const plan = planSolanaFunding(base);
    expect(plan && planAffordable(plan, 22)).toBe(true);
    expect(plan && planAffordable(plan, 20.5)).toBe(false);
  });
});

describe("fundingLegs", () => {
  it("runs the fast gas hop before the purchase funds", () => {
    const plan = planSolanaFunding(base);
    const legs = plan ? fundingLegs(plan) : [];
    expect(legs.map((l) => l.kind)).toEqual(["gas", "usdc"]);
    expect(legs[0].toToken).toBe(LIFI_NATIVE_SOL);
    expect(legs[1].usdc).toBeGreaterThan(20);
  });

  it("emits only the leg that is needed", () => {
    const plan = planSolanaFunding({ ...base, solanaSol: 0.02 });
    expect(plan && fundingLegs(plan).map((l) => l.kind)).toEqual(["usdc"]);
  });
});

describe("planSignature", () => {
  it("is stable for the same plan and differs when the plan changes", () => {
    const a = planSolanaFunding(base);
    const b = planSolanaFunding(base);
    const c = planSolanaFunding({ ...base, spendUsdc: 50 });
    expect(a && b && planSignature(a) === planSignature(b)).toBe(true);
    expect(a && c && planSignature(a) === planSignature(c)).toBe(false);
  });

  it("separates a gas top-up from an otherwise identical plan", () => {
    const withGas = planSolanaFunding({ ...base, solanaSol: 0 });
    const withoutGas = planSolanaFunding({ ...base, solanaSol: 0.02 });
    expect(withGas && withoutGas && planSignature(withGas) === planSignature(withoutGas)).toBe(
      false
    );
  });
});
