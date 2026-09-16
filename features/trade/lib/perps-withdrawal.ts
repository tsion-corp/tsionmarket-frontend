import { fromBaseUnits, toBaseUnits } from "@/lib/trade/math";

// A perps withdrawal's arithmetic, per the Ark contract (llms.txt §6b), in
// exact USDC base units. The typed amount is the TOTAL that leaves the perps
// wallet: the venue's withdraw3 carries the total less the platform fee, the
// platform fee travels as its own signed sendAsset, and the venue takes a flat
// $1 in transit from what it carries. So what lands on Base is the total less
// both fees.

const USDC_DECIMALS = 6;

/** The venue's flat withdraw3 fee, taken in transit. */
export const PERPS_VENUE_WITHDRAWAL_FEE_USDC = "1";
/**
 * The platform fee the contract documents. The backend is the authority: its
 * prepare response carries the fee it will actually collect, and the modal
 * re-plans with that figure before anything is signed.
 */
export const PERPS_PLATFORM_WITHDRAWAL_FEE_USDC = "0.5";

export type WithdrawalPlan =
  | { kind: "empty" }
  | { kind: "exceedsBalance" }
  | { kind: "belowMinimum"; minimum: string }
  | { kind: "ok"; withdraw3Amount: string; totalFee: string; receive: string };

export function planWithdrawal({
  total,
  withdrawable,
  platformFee = PERPS_PLATFORM_WITHDRAWAL_FEE_USDC,
}: {
  /** The typed amount, as the user entered it. */
  total: string;
  /** The perps wallet's free balance, from the clearinghouse. */
  withdrawable: string;
  platformFee?: string;
}): WithdrawalPlan {
  const totalUnits = toBaseUnits(total, USDC_DECIMALS);
  if (totalUnits <= 0n) return { kind: "empty" };
  if (totalUnits > toBaseUnits(withdrawable, USDC_DECIMALS)) return { kind: "exceedsBalance" };

  const platformUnits = toBaseUnits(platformFee, USDC_DECIMALS);
  const feeUnits = toBaseUnits(PERPS_VENUE_WITHDRAWAL_FEE_USDC, USDC_DECIMALS) + platformUnits;
  // Receiving nothing is not a withdrawal: the total must clear both fees.
  if (totalUnits <= feeUnits) {
    return { kind: "belowMinimum", minimum: fromBaseUnits(feeUnits, USDC_DECIMALS) };
  }

  return {
    kind: "ok",
    withdraw3Amount: fromBaseUnits(totalUnits - platformUnits, USDC_DECIMALS),
    totalFee: fromBaseUnits(feeUnits, USDC_DECIMALS),
    receive: fromBaseUnits(totalUnits - feeUnits, USDC_DECIMALS),
  };
}
