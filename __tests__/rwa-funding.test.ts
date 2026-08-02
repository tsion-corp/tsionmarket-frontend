import { describe, expect, it } from "vitest";
import {
  GAS_TOPUP_USDC,
  LIFI_NATIVE_SOL,
  fundingLegs,
  planAffordable,
  planSolanaFunding,
} from "@/lib/rwa/funding";

const base = { spendUsdc: 20, solanaUsdc: 0, solanaSol: 0, baseUsdc: 100 };

describe("planSolanaFunding", () => {
  it("needs nothing when Solana already holds the funds and gas", () => {
    expect(planSolanaFunding({ ...base, solanaUsdc: 25, solanaSol: 0.02 })).toBeNull();
  });

  it("bridges only the shortfall", () => {
    const plan = planSolanaFunding({ ...base, solanaUsdc: 12, solanaSol: 0.02 });
    expect(plan?.bridgeUsdc).toBe(8);
    expect(plan?.topUpGas).toBe(false);
    expect(plan?.totalBaseUsdc).toBe(8);
  });

  it("rounds the bridged amount up to the cent", () => {
    const plan = planSolanaFunding({ ...base, spendUsdc: 10.005, solanaSol: 0.02 });
    expect(plan?.bridgeUsdc).toBe(10.01);
  });

  it("adds a gas top-up when SOL is short, even with enough USDC", () => {
    const plan = planSolanaFunding({ ...base, solanaUsdc: 50, solanaSol: 0 });
    expect(plan?.bridgeUsdc).toBe(0);
    expect(plan?.topUpGas).toBe(true);
    expect(plan?.totalBaseUsdc).toBe(GAS_TOPUP_USDC);
  });

  it("covers both when the wallet is empty", () => {
    const plan = planSolanaFunding(base);
    expect(plan?.totalBaseUsdc).toBe(20 + GAS_TOPUP_USDC);
  });
});

describe("planAffordable", () => {
  it("compares the whole plan against the Base balance", () => {
    const plan = planSolanaFunding(base);
    expect(plan && planAffordable(plan, 21)).toBe(true);
    expect(plan && planAffordable(plan, 20.5)).toBe(false);
  });
});

describe("fundingLegs", () => {
  it("runs the fast gas hop before the purchase funds", () => {
    const plan = planSolanaFunding(base);
    const legs = plan ? fundingLegs(plan) : [];
    expect(legs.map((l) => l.kind)).toEqual(["gas", "usdc"]);
    expect(legs[0].toToken).toBe(LIFI_NATIVE_SOL);
    expect(legs[1].usdc).toBe(20);
  });

  it("emits only the leg that is needed", () => {
    const plan = planSolanaFunding({ ...base, solanaSol: 0.02 });
    expect(plan && fundingLegs(plan).map((l) => l.kind)).toEqual(["usdc"]);
  });
});
