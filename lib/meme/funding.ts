import { SOLANA_CHAIN_ID } from "@/lib/meme/chain";
import { SOLANA_MIN_BUY_USD } from "@/lib/trade/minimums";

// A memecoin is bought with the user's one USD balance, which lives as USDC on
// Base. A coin on Solana is paid for by moving that USDC to the user's Solana
// wallet first, through the same strict Dextopus route real assets use. None
// of this is the user's business: the sheet shows one spendable figure, and
// whether a move is needed is decided here.

export interface BuyFundingInput {
  chainId: number;
  payUsd: number;
  baseUsdc: number;
  solanaUsdc: number;
}

export interface BuyFunding {
  // What the buy can draw on, on either side of the move.
  spendableUsd: number;
  // A Solana coin whose Solana USDC does not cover the amount.
  needsFunding: boolean;
  // How much Base USDC to move: the shortfall, floored at the Solana minimum
  // because Dextopus will not deliver less. Any surplus stays for the next buy.
  fundingUsd: number;
  canFund: boolean;
}

const EPSILON = 1e-6;

export function buyFunding({ chainId, payUsd, baseUsdc, solanaUsdc }: BuyFundingInput): BuyFunding {
  if (chainId !== SOLANA_CHAIN_ID) {
    return { spendableUsd: baseUsdc, needsFunding: false, fundingUsd: 0, canFund: true };
  }
  const shortfall = Math.max(0, payUsd - solanaUsdc);
  const needsFunding = payUsd > 0 && shortfall > EPSILON;
  const fundingUsd = needsFunding ? Math.max(SOLANA_MIN_BUY_USD, shortfall) : 0;
  return {
    spendableUsd: baseUsdc + solanaUsdc,
    needsFunding,
    fundingUsd,
    canFund: !needsFunding || baseUsdc + EPSILON >= fundingUsd,
  };
}

// The tokens a dollar amount would buy at the listed price. Shown while the
// exact quote cannot be asked for yet: the trade service refuses to preview a
// buy the Solana wallet cannot cover, and it cannot cover it until the move
// lands. A display figure only; nothing is sized from it.
export function estimateReceive(payUsd: number, priceUsd: string | null): number | null {
  const price = priceUsd === null ? NaN : Number(priceUsd);
  if (!Number.isFinite(price) || price <= 0 || payUsd <= 0) return null;
  return payUsd / price;
}

// Atomic USDC as the human string the trade service's `amount` wants.
export function usdcFromRaw(raw: bigint): string {
  const whole = raw / 1_000_000n;
  const frac = (raw % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole.toString();
}
