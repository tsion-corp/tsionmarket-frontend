// Every amount in this service is an exact integer in the token's smallest
// unit (wei). Nothing that settles money is ever held in a float.

export interface TokenAmount {
  wei: string;
  tokenSymbol: string;
  usdValue: number;
}

export const TOKEN_SYMBOL = "ETH";

// Platform participation fee, taken from the pot when a game settles. Matches
// the figure the frontend shows before a player commits.
export const PARTICIPATION_FEE_BPS = 500n;

export function amount(wei: bigint, unitPriceUsd = 0): TokenAmount {
  return {
    wei: wei.toString(),
    tokenSymbol: TOKEN_SYMBOL,
    // Display only. Computed at the edge so the exact wei stays authoritative.
    usdValue: unitPriceUsd > 0 ? (Number(wei) / 1e18) * unitPriceUsd : 0,
  };
}

export function parseWei(value: unknown): bigint {
  if (typeof value !== "string" || !/^\d+$/.test(value)) {
    throw new BadRequest("INVALID_AMOUNT", "Stake must be a whole number of wei.");
  }
  const wei = BigInt(value);
  if (wei <= 0n) throw new BadRequest("INVALID_AMOUNT", "Stake must be greater than zero.");
  return wei;
}

// A two-player pot: both stakes in, fee out, winner takes the rest. Integer
// maths with the fee floored, so the payout is never short.
export function potBreakdown(stakeWei: bigint) {
  const pot = stakeWei * 2n;
  const fee = (pot * PARTICIPATION_FEE_BPS) / 10_000n;
  return { pot, fee, payout: pot - fee };
}

export class BadRequest extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400
  ) {
    super(message);
  }
}
