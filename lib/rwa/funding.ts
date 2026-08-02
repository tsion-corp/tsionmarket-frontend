// What a Solana RWA purchase needs before it can run, and the bridge legs that
// supply it. Pure: no wallet, no network. The panel renders from this and the
// hook executes it.
//
// Both legs are LI.FI routes whose transaction executes on Base, so the user's
// sponsored Base send pays no gas for either.

import { USDC_BY_CHAIN } from "@/lib/rwa-api";
import { SETTLE_CHAINS } from "@/lib/deposit";

// LI.FI's chain id for Solana.
export const LIFI_SOLANA_CHAIN = 1151111081099710;
export const LIFI_BASE_CHAIN = 8453;
// LI.FI names native SOL by the system program address.
export const LIFI_NATIVE_SOL = "11111111111111111111111111111111";

// Enough SOL to sign a swap several times over; the fee itself is ~0.000005
// and an associated-token-account rent-exempt deposit is ~0.002.
export const SOL_GAS_TARGET = 0.01;
// One dollar buys well over the target at any realistic SOL price, and it is
// the smallest amount bridges reliably route.
export const GAS_TOPUP_USDC = 1;

export interface FundingPlan {
  // USDC to move Base -> Solana so the buy can pay for itself. Zero when the
  // Solana wallet already holds enough.
  bridgeUsdc: number;
  // Whether to buy a little SOL for the network fee.
  topUpGas: boolean;
  // Base USDC the whole plan consumes.
  totalBaseUsdc: number;
}

export interface FundingInputs {
  // What the purchase costs, in USDC.
  spendUsdc: number;
  // Balances already on Solana.
  solanaUsdc: number;
  solanaSol: number;
  // What is available to fund from.
  baseUsdc: number;
}

// The plan for a Solana purchase, or null when nothing needs moving.
export function planSolanaFunding(input: FundingInputs): FundingPlan | null {
  const shortfall = Math.max(0, input.spendUsdc - input.solanaUsdc);
  const topUpGas = input.solanaSol < SOL_GAS_TARGET;
  if (shortfall <= 0 && !topUpGas) return null;
  // Round the bridged amount up to the cent so rounding never leaves the buy
  // a fraction short on arrival.
  const bridgeUsdc = shortfall > 0 ? Math.ceil(shortfall * 100) / 100 : 0;
  return {
    bridgeUsdc,
    topUpGas,
    totalBaseUsdc: bridgeUsdc + (topUpGas ? GAS_TOPUP_USDC : 0),
  };
}

// Whether the wallet can actually pay for the plan.
export function planAffordable(plan: FundingPlan, baseUsdc: number): boolean {
  return baseUsdc + 1e-9 >= plan.totalBaseUsdc;
}

// The two legs, in the order they run: gas first (it settles in about a second
// and unblocks signing), then the purchase funds.
export interface FundingLeg {
  kind: "gas" | "usdc";
  usdc: number;
  toToken: string;
}

export function fundingLegs(plan: FundingPlan): FundingLeg[] {
  const legs: FundingLeg[] = [];
  if (plan.topUpGas) {
    legs.push({ kind: "gas", usdc: GAS_TOPUP_USDC, toToken: LIFI_NATIVE_SOL });
  }
  if (plan.bridgeUsdc > 0) {
    legs.push({
      kind: "usdc",
      usdc: plan.bridgeUsdc,
      toToken: USDC_BY_CHAIN.solana.address,
    });
  }
  return legs;
}

export const BASE_USDC = SETTLE_CHAINS.base.usdc;
