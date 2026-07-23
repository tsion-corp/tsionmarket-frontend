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
  return `$${value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: maxDigits,
  })}`;
}

// Trimmed token amount for display. Large amounts show fewer decimals.
export function formatAmount(value: number): string {
  if (!Number.isFinite(value) || value === 0) return "0";
  const abs = Math.abs(value);
  const maxDigits = abs >= 1000 ? 2 : abs >= 1 ? 4 : 6;
  return value.toLocaleString(undefined, { maximumFractionDigits: maxDigits });
}
