// Estimated liquidation price for a Hyperliquid perp position that does not
// exist yet, for the order ticket's "Est. liquidation" row.
//
// WHY THIS FILE EXISTS AT ALL
//
// Hyperliquid reports a real liquidation price, but only for a position that
// is already open: `clearinghouseState` returns `liquidationPx` on each entry
// of `assetPositions` (see the SDK's own contract at
// node_modules/@nktkas/hyperliquid/esm/api/info/_methods/clearinghouseState.d.ts:130).
// There is no pre-trade equivalent. The full info surface was checked
// (node_modules/@nktkas/hyperliquid/esm/api/info/_methods/): the closest
// candidates are `activeAssetData`, which returns leverage, max trade size,
// available-to-trade and mark price but no liquidation figure, and
// `marginTable`, which returns the leverage tiers and nothing user-specific.
// So a figure shown before the order is placed has to be computed here.
//
// THE FORMULA
//
// Hyperliquid documents it as:
//
//   liq_price = price - side * margin_available / position_size / (1 - l * side)
//
//   side              +1 for a long, -1 for a short.
//   price             the fill price the estimate is anchored to.
//   position_size     the position in the asset's own units, unsigned.
//   l                 1 / MAINTENANCE_LEVERAGE, which is the maintenance
//                     margin rate for the tier the notional lands in.
//   margin_available  isolated: isolated_margin - maintenance_margin_required
//                     cross:    account_value  - maintenance_margin_required
//
// and the maintenance margin itself as:
//
//   maintenance_margin = notional * maintenance_margin_rate - maintenance_deduction
//   maintenance_margin_rate(tier n) = (initial margin rate at that tier's max leverage) / 2
//
// Source: Hyperliquid docs, "Liquidations" and "Margin tiers".
//
// WHAT THIS MODULE ASSUMES, AND WHAT IT REFUSES
//
//   * The maintenance margin rate is a required input, never guessed. The
//     rate depends on which margin tier the notional falls in, and this app
//     does not read `marginTable` from anywhere, so the tier cannot be
//     established in code. `tierZeroMaintenanceMarginRate` below applies the
//     venue's documented rate for the FIRST tier only, and the caller opts
//     into that by name.
//   * `maintenance_deduction` is taken as zero, which is exact in tier 0 and
//     wrong above it. That is why the rate is not derived silently: on a
//     larger position the real tier carries a lower max leverage, so a
//     tier-0 rate puts the liquidation price further from entry than it
//     really is. Understating the risk is the failure that matters here.
//   * A wallet that already holds a position in the same asset gets no
//     estimate. The new order would blend into the existing size and entry,
//     and none of that is modelled here.
//   * Cross margin needs the whole account. The two account figures it takes
//     are the ones the app already has typed on HlClearinghouseState
//     (`marginSummary.accountValue` and `crossMaintenanceMarginUsed`).
//
// Every input and every output is a decimal string, and all arithmetic runs
// on scaled bigints. No price, size, margin or liquidation is ever a float.

import { fromBaseUnits } from "@/lib/trade/math";

export type LiquidationSide = "long" | "short";

export type LiquidationUnavailableReason =
  // An input was absent, malformed, or not a plain decimal.
  | "missingInput"
  // Nothing would be opened: zero notional, or zero leverage.
  | "zeroSize"
  // The wallet already has a position in this asset, so the order would
  // blend rather than open.
  | "existingPosition"
  // The margin behind the order is already at or below what maintenance
  // requires. There is no level to warn about; the position is liquidatable
  // from the start.
  | "belowMaintenance"
  // The price would have to go to zero or through it. Hyperliquid reports
  // `liquidationPx: null` in the same situation.
  | "unreachable";

export type LiquidationEstimate =
  { status: "ok"; price: string } | { status: "unavailable"; reason: LiquidationUnavailableReason };

export type LiquidationMargin =
  | {
      mode: "isolated";
      /** Margin locked to this position, USDC. Notional divided by leverage. */
      collateralUsdc: string;
    }
  | {
      mode: "cross";
      /** HlClearinghouseState.marginSummary.accountValue. */
      accountValueUsdc: string;
      /** HlClearinghouseState.crossMaintenanceMarginUsed, before this order. */
      existingMaintenanceMarginUsdc: string;
    };

export interface LiquidationInput {
  side: LiquidationSide;
  /** The price the order is expected to fill at. */
  entryPrice: string;
  /** Position notional in USDC: collateral times leverage. */
  notionalUsdc: string;
  /**
   * Maintenance margin rate for the tier this notional lands in, as a
   * fraction ("0.025" for 2.5%). See the header: this is required rather
   * than derived, because the tier is not knowable from what the app fetches.
   */
  maintenanceMarginRate: string;
  /** True when the wallet already holds a position in this asset. */
  hasExistingPositionInAsset: boolean;
  margin: LiquidationMargin;
}

// Working precision for every intermediate. Far beyond any price or size the
// venue quotes, so the only rounding is at the last digit of the result.
const SCALE_DECIMALS = 18;
const ONE = 10n ** BigInt(SCALE_DECIMALS);

// A plain signed decimal. Rejects exponents, spaces, a bare sign, and "1."
// or ".5", which are the shapes that quietly parse to something else.
const DECIMAL = /^-?\d+(\.\d+)?$/;

/**
 * Parse a decimal string into a bigint scaled by 10^18, or null when the
 * string is not a plain decimal. Digits past the scale are dropped.
 * Unlike toBaseUnits this separates "invalid" from "zero", which is the
 * whole point: a zero here is a real reading and an invalid one is not.
 */
function parseScaled(value: string): bigint | null {
  if (!DECIMAL.test(value)) return null;
  const negative = value.startsWith("-");
  const magnitude = negative ? value.slice(1) : value;
  const [whole = "", frac = ""] = magnitude.split(".");
  const fracPadded = (frac + "0".repeat(SCALE_DECIMALS)).slice(0, SCALE_DECIMALS);
  const parsed = BigInt(whole + fracPadded);
  return negative ? -parsed : parsed;
}

/** a * b, both scaled. Truncates toward zero at the last digit. */
function mul(a: bigint, b: bigint): bigint {
  return (a * b) / ONE;
}

/** a / b, both scaled. The caller checks b for zero first. */
function div(a: bigint, b: bigint): bigint {
  return (a * ONE) / b;
}

/**
 * The maintenance margin rate for an asset's FIRST margin tier, from the
 * venue's rule that the maintenance rate is half the initial margin rate at
 * that tier's max leverage: 1 / (2 * maxLeverage).
 *
 * Only correct while the notional stays inside tier 0. Above it the real max
 * leverage is lower and the real rate is higher, which puts the true
 * liquidation price closer to entry than this rate produces. Read the header
 * before using it for a large position.
 *
 * Returns null for a max leverage that is not a positive integer.
 */
export function tierZeroMaintenanceMarginRate(maxLeverage: number): string | null {
  if (!Number.isInteger(maxLeverage) || maxLeverage <= 0) return null;
  return fromBaseUnits(ONE / (2n * BigInt(maxLeverage)), SCALE_DECIMALS);
}

/**
 * Estimated liquidation price for an order that has not been placed.
 *
 * Returns `{ status: "unavailable", reason }` rather than a number whenever
 * an input is missing or the model does not hold. The caller renders that as
 * an explicit unavailable row. It must never substitute a figure of its own:
 * a liquidation price a user acts on and that the venue does not agree with
 * is worse than no liquidation price at all.
 */
export function estimateLiquidationPrice(input: LiquidationInput): LiquidationEstimate {
  if (input.hasExistingPositionInAsset) {
    return { status: "unavailable", reason: "existingPosition" };
  }

  const entryPrice = parseScaled(input.entryPrice);
  const notional = parseScaled(input.notionalUsdc);
  const rate = parseScaled(input.maintenanceMarginRate);
  if (entryPrice === null || notional === null || rate === null) {
    return { status: "unavailable", reason: "missingInput" };
  }
  if (entryPrice <= 0n) return { status: "unavailable", reason: "missingInput" };
  // A rate at or above 1 would make the denominator zero or negative for a
  // long, and no real tier comes close to it.
  if (rate <= 0n || rate >= ONE) return { status: "unavailable", reason: "missingInput" };
  if (notional <= 0n) return { status: "unavailable", reason: "zeroSize" };

  // Unsigned size in the asset's own units. The formula's sign lives in
  // `sideSign`, not here.
  const positionSize = div(notional, entryPrice);
  if (positionSize <= 0n) return { status: "unavailable", reason: "zeroSize" };

  // maintenance_margin = notional * rate. The tier deduction is zero, which
  // holds in tier 0 and is the assumption stated in the header.
  const maintenanceMargin = mul(notional, rate);

  let marginAvailable: bigint;
  if (input.margin.mode === "isolated") {
    const collateral = parseScaled(input.margin.collateralUsdc);
    if (collateral === null) return { status: "unavailable", reason: "missingInput" };
    marginAvailable = collateral - maintenanceMargin;
  } else {
    const accountValue = parseScaled(input.margin.accountValueUsdc);
    const existingMaintenance = parseScaled(input.margin.existingMaintenanceMarginUsdc);
    if (accountValue === null || existingMaintenance === null) {
      return { status: "unavailable", reason: "missingInput" };
    }
    marginAvailable = accountValue - existingMaintenance - maintenanceMargin;
  }

  if (marginAvailable <= 0n) {
    return { status: "unavailable", reason: "belowMaintenance" };
  }

  // 1 - l * side. A long divides by (1 - rate), a short by (1 + rate).
  const sideSign = input.side === "long" ? 1n : -1n;
  const denominator = ONE - rate * sideSign;

  const distance = div(div(marginAvailable, positionSize), denominator);
  const price = entryPrice - sideSign * distance;

  // A long whose liquidation lands at or below zero cannot be liquidated on
  // the way down; the venue reports null for it, and so does this.
  if (price <= 0n) return { status: "unavailable", reason: "unreachable" };

  return { status: "ok", price: fromBaseUnits(price, SCALE_DECIMALS) };
}
