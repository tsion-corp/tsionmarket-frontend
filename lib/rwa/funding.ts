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

// Enough SOL to cover what a buy actually spends: two rent-exempt
// associated-token accounts at ~0.00204 each, plus signature fees of ~0.000005.
// A wallet at or above this needs no gas leg.
export const SOL_GAS_MIN = 0.005;
// One dollar is the smallest amount bridges reliably route, and buys several
// times the minimum at any realistic SOL price.
export const GAS_TOPUP_USDC = 1;

// A bridge charges a fixed relayer fee plus a proportional cut, and at these
// sizes the fixed part dominates: a measured $3.06 hop delivered $2.88, six
// percent down, where a purely proportional 2% allowance had predicted 0.7%.
// That left the purchase unaffordable and too little on Base to retry, so the
// estimate now carries the fixed cost too — and the hook still re-sizes the
// send against the live quote before committing to it.
const BRIDGE_FIXED_COST_USDC = 0.2;
const BRIDGE_RATE_BUFFER = 1.02;
// Below this, the percentage cost of a hop is punitive, so top up to it rather
// than bridge dust.
const MIN_BRIDGE_USDC = 2;

// Enough SOL to sign one outbound transfer. Unlike the Base direction there is
// nothing to bootstrap with: sending anything from Solana costs SOL, so a
// wallet holding only USDC there cannot move it and has to be told so.
export const SOL_SIGN_MIN = 0.001;

function roundUpCents(value: number): number {
  return Math.ceil(value * 100) / 100;
}

// What to send so the arrival covers the shortfall, rounded up to the cent. A
// dust-sized hop is raised to the minimum instead. Shared by both directions.
function sizeBridgeSend(shortfall: number): number {
  if (shortfall <= 0) return 0;
  return roundUpCents(
    Math.max(shortfall * BRIDGE_RATE_BUFFER + BRIDGE_FIXED_COST_USDC, MIN_BRIDGE_USDC)
  );
}

export interface FundingPlan {
  // USDC to move Base -> Solana so the buy can pay for itself. Zero when the
  // Solana wallet already holds enough. An estimate: the hook re-sizes it
  // against the live quote before sending.
  bridgeUsdc: number;
  // What must actually land on Solana for the buy to be affordable. The send
  // is sized to deliver at least this.
  requiredArrivalUsdc: number;
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
// One USDC base unit. Spending exactly the balance leaves float residue, and
// without this a shortfall of 1e-16 would be rounded up into a whole $2 bridge
// — stranding the buy again at the moment it became affordable.
const DUST_USDC = 1e-6;

export function planSolanaFunding(input: FundingInputs): FundingPlan | null {
  const raw = input.spendUsdc - input.solanaUsdc;
  const shortfall = raw > DUST_USDC ? raw : 0;
  const topUpGas = input.solanaSol < SOL_GAS_MIN;
  if (shortfall <= 0 && !topUpGas) return null;
  const bridgeUsdc = sizeBridgeSend(shortfall);
  return {
    bridgeUsdc,
    requiredArrivalUsdc: shortfall,
    topUpGas,
    totalBaseUsdc: bridgeUsdc + (topUpGas ? GAS_TOPUP_USDC : 0),
  };
}

// The send that would have delivered `required`, learned from a trial quote
// that fell short. A bridge's cost is a fixed fee plus a rate and we cannot see
// which dominates, so take whichever model asks for more, with a little on top.
// Null when the trial already delivers enough, or is too degenerate to learn
// from. Never returns more than `maxSend`, so a re-size cannot outgrow what the
// wallet can pay.
export function resizeBridgeSend(
  sent: number,
  delivered: number,
  required: number,
  maxSend: number
): number | null {
  if (!(sent > 0) || !(delivered > 0) || delivered >= required) return null;
  const fixedFeeModel = required + (sent - delivered);
  const rateModel = sent * (required / delivered);
  const resized = roundUpCents(Math.max(fixedFeeModel, rateModel) * 1.005);
  if (resized <= sent) return null;
  return resized <= maxSend ? resized : null;
}

// Whether the wallet can actually pay for the plan.
export function planAffordable(plan: FundingPlan, baseUsdc: number): boolean {
  return baseUsdc + 1e-9 >= plan.totalBaseUsdc;
}

// The mirror direction: buying a Base asset while the USDC sits on Solana.
// Base trades are gas-sponsored, so nothing has to be bought for fees on the
// receiving side — but the sending side is Solana, which charges the wallet
// SOL to sign, and that cannot be bootstrapped from Solana itself.
export interface BaseFundingPlan {
  // USDC to move Solana -> Base. Capped at the Solana balance, so it never
  // asks to send more than there is.
  bridgeUsdc: number;
  // What must land on Base for the buy to be affordable.
  requiredArrivalUsdc: number;
  // The wallet holds the USDC but not the SOL to send it anywhere.
  needsSolForGas: boolean;
}

export interface BaseFundingInputs {
  spendUsdc: number;
  baseUsdc: number;
  solanaUsdc: number;
  solanaSol: number;
}

export function planBaseFunding(input: BaseFundingInputs): BaseFundingPlan | null {
  const raw = input.spendUsdc - input.baseUsdc;
  const shortfall = raw > DUST_USDC ? raw : 0;
  // Nothing to move, or nothing to move it from — the deposit flow covers that.
  if (shortfall <= 0 || input.solanaUsdc <= 0) return null;
  return {
    bridgeUsdc: Math.min(sizeBridgeSend(shortfall), input.solanaUsdc),
    requiredArrivalUsdc: shortfall,
    needsSolForGas: input.solanaSol < SOL_SIGN_MIN,
  };
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

// Identifies a plan, so an in-flight funding run can tell "the same plan,
// retried" from "a different amount, re-planned".
export function planSignature(plan: FundingPlan): string {
  return `${plan.bridgeUsdc.toFixed(2)}:${plan.topUpGas ? "gas" : "nogas"}`;
}
