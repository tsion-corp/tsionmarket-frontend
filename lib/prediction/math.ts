// Pure AMM math for the prediction market. No framework imports. Everything is
// bigint in 6-decimal fixed point so no float ever touches the money path.
//
// The contract is a constant-product market maker (x*y=k) over a binary outcome
// where 1 USDC = 1 YES + 1 NO (a "complete set"). Reserves rYes/rNo hold outcome
// shares; priceYes = rNo/(rYes+rNo). This is the standard Gnosis fixed-product
// market maker (FPMM):
//   - buy(side, usdcIn): fee is taken off usdcIn, the remainder mints a complete
//     set (added to BOTH reserves), then shares of `side` are removed to hold the
//     product constant. Closed form, no sqrt.
//   - sell(side, sharesIn): the shares are added to `side`'s reserve, then a
//     complete set is removed from BOTH reserves to hold the product constant and
//     that amount is paid out (a quadratic in the payout, solved with integer
//     sqrt), fee taken off the output.
//
// IMPORTANT: these formulas are the standard FPMM and match the documented
// price relation, but the exact rounding of `buy`/`sell` is set by the deployed
// contract. Before trusting a quote for anything but the slippage-guard floor,
// reconcile quoteBuy/quoteSell against a live read/simulate of the contract and
// re-pin the test expectations (see the plan's verification step 2). The guard
// (minOut) is the real protection: an over-estimate reverts, it never overpays.
//
// Rounding rule: every division floors (bigint `/`), and minOut floors, so the
// slippage guard is never looser than the quoted output. A ceil anywhere could
// let a trade pass the guard yet revert on-chain.

import { PRICE_SCALE, type Side } from "@/lib/prediction/types";

const BPS = 10_000n;

export interface BuyQuote {
  sharesOut: bigint;
  newRYes: bigint;
  newRNo: bigint;
}

export interface SellQuote {
  usdcOut: bigint;
  newRYes: bigint;
  newRNo: bigint;
}

export interface LpBreakdown {
  yesOut: bigint;
  noOut: bigint;
}

// Integer square root (floor) via Newton's method. Used by the sell quadratic.
export function bigintSqrt(value: bigint): bigint {
  if (value < 0n) throw new Error("Cannot take the square root of a negative number.");
  if (value < 2n) return value;
  let x = value;
  let y = (x + 1n) / 2n;
  while (y < x) {
    x = y;
    y = (x + value / x) / 2n;
  }
  return x;
}

// Ceiling integer square root: floor + 1 unless value is a perfect square.
function bigintSqrtCeil(value: bigint): bigint {
  const root = bigintSqrt(value);
  return root * root === value ? root : root + 1n;
}

// Ceiling division for non-negative bigints.
function ceilDiv(numerator: bigint, denominator: bigint): bigint {
  return (numerator + denominator - 1n) / denominator;
}

// Probability of YES from reserves, as 0..PRICE_SCALE. Empty reserves have no
// defined price, so the caller must not quote against a market with no liquidity.
export function priceYesFromReserves(rYes: bigint, rNo: bigint): bigint {
  const total = rYes + rNo;
  if (total <= 0n) throw new Error("Market has no liquidity.");
  return (rNo * PRICE_SCALE) / total;
}

export function priceNoFromReserves(rYes: bigint, rNo: bigint): bigint {
  return PRICE_SCALE - priceYesFromReserves(rYes, rNo);
}

// Collateral left after the trade fee, in base units. Fee floors in the LPs'
// favor (the trader keeps no more than the fee-adjusted amount).
export function applyFee(usdcIn: bigint, feeBps: number): bigint {
  if (usdcIn < 0n) throw new Error("Amount must not be negative.");
  return (usdcIn * (BPS - BigInt(feeBps))) / BPS;
}

// Shares received for buying `side` with `usdcIn`. FPMM closed form:
//   effective = usdcIn net of fee; add to both reserves; remove same-side shares
//   to hold k constant. sharesOut = (sameReserve + eff) - k/(otherReserve + eff).
export function quoteBuy(
  rYes: bigint,
  rNo: bigint,
  side: Side,
  usdcIn: bigint,
  feeBps: number
): BuyQuote {
  if (usdcIn < 0n) throw new Error("Amount must not be negative.");
  if (rYes <= 0n || rNo <= 0n) throw new Error("Market has no liquidity.");
  if (usdcIn === 0n) return { sharesOut: 0n, newRYes: rYes, newRNo: rNo };

  const eff = applyFee(usdcIn, feeBps);
  const k = rYes * rNo;
  // Both reserves grow by the complete set minted from `eff`.
  const yesAfterMint = rYes + eff;
  const noAfterMint = rNo + eff;
  const same = side === "yes" ? yesAfterMint : noAfterMint;
  const other = side === "yes" ? noAfterMint : yesAfterMint;
  // Remove same-side shares to restore the product. Ceil the ending same-side
  // balance so the pool's product never dips below k (LP-safe, matches Gnosis
  // FPMM); the trader gets no more shares than the invariant allows.
  const remaining = ceilDiv(k, other);
  const sharesOut = same - remaining;
  if (side === "yes") {
    return { sharesOut, newRYes: remaining, newRNo: noAfterMint };
  }
  return { sharesOut, newRYes: yesAfterMint, newRNo: remaining };
}

// USDC received for selling `sharesIn` of `side`. FPMM inverse:
//   add shares to same-side reserve, then remove `a` complete sets from both so
//   (sameReserve + sharesIn - a)(otherReserve - a) = k. Solving the quadratic:
//   a^2 - a*(same + sharesIn + other) + sharesIn*other = 0, take the smaller
//   root. Payout is `a` net of fee.
export function quoteSell(
  rYes: bigint,
  rNo: bigint,
  side: Side,
  sharesIn: bigint,
  feeBps: number
): SellQuote {
  if (sharesIn < 0n) throw new Error("Amount must not be negative.");
  if (rYes <= 0n || rNo <= 0n) throw new Error("Market has no liquidity.");
  if (sharesIn === 0n) return { usdcOut: 0n, newRYes: rYes, newRNo: rNo };

  const same = side === "yes" ? rYes : rNo;
  const other = side === "yes" ? rNo : rYes;
  const b = same + sharesIn + other; // sum of the linear coefficient
  const c = sharesIn * other;
  const disc = b * b - 4n * c;
  if (disc < 0n) throw new Error("Sell amount is out of range for this market.");
  // Smaller root: a = (b - sqrt(disc)) / 2. Ceil the sqrt so the payout `a` is
  // never over-estimated (LP-safe, and it keeps a buy-then-sell round trip from
  // ever returning more than was put in).
  const a = (b - bigintSqrtCeil(disc)) / 2n;
  const gross = a >= other ? other : a; // never remove more than the pool holds
  const usdcOut = applyFee(gross, feeBps);
  const newSame = same + sharesIn - gross;
  const newOther = other - gross;
  if (side === "yes") {
    return { usdcOut, newRYes: newSame, newRNo: newOther };
  }
  return { usdcOut, newRYes: newOther, newRNo: newSame };
}

// Slippage-guard floor: the least output a trade may return before it should
// revert. Floors, so the guard is never looser than the quote.
export function minOut(expected: bigint, toleranceBps: number): bigint {
  if (expected < 0n) throw new Error("Expected output must not be negative.");
  if (toleranceBps < 0 || toleranceBps > 10_000) {
    throw new Error("Tolerance must be between 0 and 10000 bps.");
  }
  return (expected * (BPS - BigInt(toleranceBps))) / BPS;
}

// A complete set is 1 YES + 1 NO for 1 USDC, all 6-dec, so the USDC cost of
// `shares` complete sets is the same figure (1:1).
export function completeSetCost(shares: bigint): bigint {
  if (shares < 0n) throw new Error("Shares must not be negative.");
  return shares;
}

// Redemption value of winning/losing shares after resolution: a winning share
// redeems 1:1 for USDC, a losing share is worthless.
export function payout(shares: bigint, won: boolean): bigint {
  if (shares < 0n) throw new Error("Shares must not be negative.");
  return won ? shares : 0n;
}

// Pro-rata reserves backing an LP position. removeLiquidity returns roughly this
// (as USDC plus any leftover shares); shown as a withdrawal preview.
export function lpValue(lpShares: bigint, totalLp: bigint, rYes: bigint, rNo: bigint): LpBreakdown {
  if (lpShares < 0n || totalLp < 0n) throw new Error("LP shares must not be negative.");
  if (totalLp === 0n) return { yesOut: 0n, noOut: 0n };
  return {
    yesOut: (rYes * lpShares) / totalLp,
    noOut: (rNo * lpShares) / totalLp,
  };
}
