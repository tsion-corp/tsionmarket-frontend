// Exact decimal arithmetic for Paycrest amounts and rates. Paycrest's v2 API
// speaks decimal strings ("100.5", "1441.2"); every check and conversion here
// runs on bigint base units so no amount ever passes through floating point.

const DECIMAL = /^\d+(\.\d+)?$/;

/** True when `text` is a plain non-negative decimal ("10", "10.25"). */
export function isDecimalString(text: string): boolean {
  return DECIMAL.test(text);
}

/**
 * Parse a decimal string into base units with `decimals` places. Returns null
 * for anything that isn't a plain decimal, or that carries more fractional
 * digits than the unit allows (it would have to be rounded, and money is
 * never silently rounded).
 */
export function parseUnits(text: string, decimals: number): bigint | null {
  const trimmed = text.trim();
  if (!DECIMAL.test(trimmed)) return null;
  const [whole, frac = ""] = trimmed.split(".");
  if (frac.length > decimals) return null;
  return BigInt(whole + frac.padEnd(decimals, "0"));
}

/** Format base units as a trimmed decimal string ("100.5", never "100.50"). */
export function formatUnits(units: bigint, decimals: number): string {
  const negative = units < 0n;
  const digits = (negative ? -units : units).toString().padStart(decimals + 1, "0");
  const whole = digits.slice(0, digits.length - decimals);
  const frac = decimals > 0 ? digits.slice(digits.length - decimals).replace(/0+$/, "") : "";
  return `${negative ? "-" : ""}${whole}${frac ? `.${frac}` : ""}`;
}

// A rate as an exact fraction: numerator over 10^scale.
function rateFraction(rate: string): { numerator: bigint; scale: bigint } | null {
  const trimmed = rate.trim();
  if (!DECIMAL.test(trimmed)) return null;
  const frac = trimmed.split(".")[1] ?? "";
  const numerator = BigInt(trimmed.replace(".", ""));
  if (numerator === 0n) return null;
  return { numerator, scale: 10n ** BigInt(frac.length) };
}

/**
 * Fiat base units for a token amount at a fiat-per-token rate, rounded down
 * so an estimate never promises more than the rate gives. Null for a bad or
 * zero rate.
 */
export function fiatForToken(
  tokenUnits: bigint,
  tokenDecimals: number,
  rate: string,
  fiatDecimals: number
): bigint | null {
  const r = rateFraction(rate);
  if (!r) return null;
  return (
    (tokenUnits * r.numerator * 10n ** BigInt(fiatDecimals)) /
    (10n ** BigInt(tokenDecimals) * r.scale)
  );
}

/** Token base units for a fiat amount at a fiat-per-token rate, rounded down. */
export function tokenForFiat(
  fiatUnits: bigint,
  fiatDecimals: number,
  rate: string,
  tokenDecimals: number
): bigint | null {
  const r = rateFraction(rate);
  if (!r) return null;
  return (
    (fiatUnits * r.scale * 10n ** BigInt(tokenDecimals)) /
    (r.numerator * 10n ** BigInt(fiatDecimals))
  );
}

/** Group the whole part for display ("1,234,567.5"). Display edge only. */
export function groupDecimal(text: string): string {
  const [whole, frac] = text.split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return frac !== undefined ? `${grouped}.${frac}` : grouped;
}
