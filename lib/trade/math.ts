// Pure trade math. No framework imports. Amounts that map to on-chain base
// units use bigint so we never lose precision to floating point.

// Maintenance margin used for the simplified isolated-margin liquidation model.
// Real venues publish per-market maintenance margins. This is a UI estimate.
export const MAINTENANCE_MARGIN = 0.005;

const DECIMAL_INPUT = /^\d*\.?\d*$/;

// Convert a human amount string ("1.5") into integer base units for a token
// with the given decimals. Invalid or empty input returns 0n.
export function toBaseUnits(human: string, decimals: number): bigint {
  const cleaned = human.trim();
  if (!cleaned || !DECIMAL_INPUT.test(cleaned)) return 0n;
  const [whole = "", frac = ""] = cleaned.split(".");
  const fracPadded = (frac + "0".repeat(decimals)).slice(0, decimals);
  const digits = (whole + fracPadded).replace(/^0+(?=\d)/, "");
  return BigInt(digits || "0");
}

// Convert integer base units back into a trimmed human amount string.
export function fromBaseUnits(raw: bigint, decimals: number): string {
  const negative = raw < 0n;
  const magnitude = (negative ? -raw : raw).toString().padStart(decimals + 1, "0");
  const whole = magnitude.slice(0, magnitude.length - decimals);
  const frac = magnitude.slice(magnitude.length - decimals).replace(/0+$/, "");
  const value = frac ? `${whole}.${frac}` : whole;
  return negative ? `-${value}` : value;
}

// Notional size of a leveraged position given collateral and leverage.
export function positionSize(collateral: number, leverage: number): number {
  if (collateral <= 0 || leverage <= 0) return 0;
  return collateral * leverage;
}

// Estimated liquidation price for an isolated-margin position. The position is
// liquidated once losses eat the collateral down to the maintenance margin.
export function liquidationPrice(
  entry: number,
  leverage: number,
  side: "long" | "short",
  maintenanceMargin: number = MAINTENANCE_MARGIN
): number {
  if (entry <= 0 || leverage <= 0) return 0;
  const distance = 1 / leverage - maintenanceMargin;
  return side === "long" ? entry * (1 - distance) : entry * (1 + distance);
}

// Estimated fee on a perps open or close, a flat rate on the notional size —
// mirrors Ark's Hyperliquid builder fee (PERPS_BUILDER_FEE_TENTHS_BPS, see
// apps/perp), charged on BOTH legs of a round trip. Like the liquidation
// model this is a UI estimate shown before signing; the real deduction
// happens on Hyperliquid's side at fill.
export const PERPS_TAKER_FEE_RATE = 0.0008;

export function openFee(size: number): number {
  return size > 0 ? size * PERPS_TAKER_FEE_RATE : 0;
}

export function closeFee(size: number): number {
  return size > 0 ? size * PERPS_TAKER_FEE_RATE : 0;
}

// Withdrawing from the perps wallet is two hops under the hood (HyperCore ->
// Arbitrum -> Base) — this is a UI estimate of the combined cost, shown to
// the user up front as one "platform fee" rather than the two-hop breakdown.
// Hyperliquid's own flat withdrawal fee (verified against its docs this
// session): $1, taken off the top before the second leg's conversion fee
// applies to what's left.
export const WITHDRAWAL_FLAT_FEE_USDC = 1;
// The Arbitrum -> Base conversion leg's fee rate, applied to the balance
// remaining after the flat fee above. The real amount is fixed by a live
// quote at withdrawal time; this estimate just sets expectations beforehand.
export const WITHDRAWAL_CONVERSION_FEE_RATE = 0.002;

export function estimatedWithdrawalFee(amountUsdc: number): number {
  if (amountUsdc <= 0) return 0;
  const flatFee = Math.min(amountUsdc, WITHDRAWAL_FLAT_FEE_USDC);
  const afterFlatFee = amountUsdc - flatFee;
  return flatFee + afterFlatFee * WITHDRAWAL_CONVERSION_FEE_RATE;
}

// Amount of the receive asset you get by paying `amount` of the pay asset,
// derived purely from live USD prices. Used when no on-chain route is available.
export function receiveFromPrices(amount: number, payPrice: number, receivePrice: number): number {
  if (amount <= 0 || payPrice <= 0 || receivePrice <= 0) return 0;
  return (amount * payPrice) / receivePrice;
}

export function formatUsd(value: number): string {
  if (!Number.isFinite(value)) return "$0.00";
  const abs = Math.abs(value);
  const maxDigits = abs >= 1 ? 2 : abs >= 0.01 ? 4 : 6;
  const formatted = abs.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: maxDigits,
  });
  // The sign belongs before the currency symbol ("-$1.00"), not inside the
  // number ("$-1.00") — toLocaleString on a negative value does the latter.
  return value < 0 ? `-$${formatted}` : `$${formatted}`;
}

// Trimmed token amount for display. Large amounts show fewer decimals.
export function formatAmount(value: number): string {
  if (!Number.isFinite(value) || value === 0) return "0";
  const abs = Math.abs(value);
  const maxDigits = abs >= 1000 ? 2 : abs >= 1 ? 4 : 6;
  return value.toLocaleString(undefined, { maximumFractionDigits: maxDigits });
}

// Large dollar figures (volume, open interest) as "$1.2M" rather than every digit.
export function formatCompactUsd(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(value);
}
