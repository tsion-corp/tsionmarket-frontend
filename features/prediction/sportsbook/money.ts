const DECIMAL_PATTERN = /^\d+(?:\.\d+)?$/u;
const ODDS_SCALE = 1_000_000n;
const USDC_DECIMALS = 6;
const PRICE_DECIMALS = 8;

export function decimalToAtomic(value: string, decimals: number): bigint | null {
  const normalized = value.trim();
  if (!DECIMAL_PATTERN.test(normalized) || decimals < 0 || decimals > 36) return null;
  const [whole, fraction = ""] = normalized.split(".");
  if (fraction.length > decimals) return null;
  return (
    BigInt(whole) * 10n ** BigInt(decimals) +
    BigInt((fraction + "0".repeat(decimals)).slice(0, decimals))
  );
}

export function atomicToDecimal(value: string | bigint, decimals: number, precision = 6): string {
  const atomic = typeof value === "bigint" ? value : BigInt(value);
  const scale = 10n ** BigInt(decimals);
  const whole = atomic / scale;
  const fraction = (atomic % scale).toString().padStart(decimals, "0").slice(0, precision);
  return fraction.replace(/0+$/u, "")
    ? `${whole}.${fraction.replace(/0+$/u, "")}`
    : whole.toString();
}

export function compareDecimals(left: string, right: string, decimals: number): number | null {
  const a = decimalToAtomic(left, decimals);
  const b = decimalToAtomic(right, decimals);
  if (a == null || b == null) return null;
  return a === b ? 0 : a < b ? -1 : 1;
}

function oddsAtomic(odds: string): bigint | null {
  return decimalToAtomic(odds, 6);
}

export function combinedOdds(values: string[]): string {
  let result = ODDS_SCALE;
  for (const value of values) {
    const next = oddsAtomic(value);
    if (!next) return "0";
    result = (result * next) / ODDS_SCALE;
  }
  return atomicToDecimal(result, 6, 2);
}

export function estimatedPayout(stake: string, odds: string, decimals: number): string | null {
  const stakeAtomic = decimalToAtomic(stake, decimals);
  const oddsValue = oddsAtomic(odds);
  if (stakeAtomic == null || oddsValue == null) return null;
  return atomicToDecimal((stakeAtomic * oddsValue) / ODDS_SCALE, decimals, 6);
}

function priceToAtomic(priceUsd: number): bigint | null {
  if (!Number.isFinite(priceUsd) || priceUsd <= 0) return null;
  return decimalToAtomic(priceUsd.toFixed(PRICE_DECIMALS), PRICE_DECIMALS);
}

export function usdcToTokenAmount(
  value: string,
  tokenPriceUsd: number,
  tokenDecimals: number
): string | null {
  const usdcAtomic = decimalToAtomic(value, USDC_DECIMALS);
  const priceAtomic = priceToAtomic(tokenPriceUsd);
  if (usdcAtomic == null || priceAtomic == null) return null;
  const tokenAtomic =
    (usdcAtomic * 10n ** BigInt(tokenDecimals) * 10n ** BigInt(PRICE_DECIMALS)) /
    (10n ** BigInt(USDC_DECIMALS) * priceAtomic);
  return atomicToDecimal(tokenAtomic, tokenDecimals, tokenDecimals);
}

export function tokenToUsdcAmount(
  value: string,
  tokenPriceUsd: number,
  tokenDecimals: number
): string | null {
  const tokenAtomic = decimalToAtomic(value, tokenDecimals);
  const priceAtomic = priceToAtomic(tokenPriceUsd);
  if (tokenAtomic == null || priceAtomic == null) return null;
  const usdcAtomic =
    (tokenAtomic * priceAtomic * 10n ** BigInt(USDC_DECIMALS)) /
    (10n ** BigInt(tokenDecimals) * 10n ** BigInt(PRICE_DECIMALS));
  return atomicToDecimal(usdcAtomic, USDC_DECIMALS, USDC_DECIMALS);
}

export function settlementTokenPriceUsd(symbol: string, ethPriceUsd: number): number | null {
  const normalized = symbol.trim().toUpperCase();
  if (["USDC", "USDT", "USDC.E"].includes(normalized)) return 1;
  if (normalized === "WETH" || normalized === "ETH") {
    return Number.isFinite(ethPriceUsd) && ethPriceUsd > 0 ? ethPriceUsd : null;
  }
  return null;
}

export function formatUsdcAmount(value: string | null, maximumFractionDigits = 2): string {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) return "0.00";
  if (amount > 0 && amount < 0.01) return "<0.01";
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: amount < 1 ? 2 : 0,
    maximumFractionDigits,
  }).format(amount);
}
