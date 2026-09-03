import { fromBaseUnits, toBaseUnits } from "@/lib/trade/math";

const PLAIN_DECIMAL = /^\d*\.?\d*$/;

export function normalizeArkjetAmount(value: string, decimals: number): string | null {
  const cleaned = value.trim();
  if (!cleaned || !PLAIN_DECIMAL.test(cleaned)) return null;
  const units = toBaseUnits(cleaned, decimals);
  return units > 0n ? fromBaseUnits(units, decimals) : null;
}

export function amountUnits(value: string | null, decimals: number): bigint {
  return value === null ? 0n : toBaseUnits(value, decimals);
}

export function ngnToDepositUsdc(
  amountNgn: string,
  currencyDecimals: number,
  tokenDecimals: number,
  ngnMinorPerUsdc: string
): string {
  const ngnMinor = toBaseUnits(amountNgn, currencyDecimals);
  const rate = BigInt(ngnMinorPerUsdc);
  if (ngnMinor <= 0n || rate <= 0n) return "0";

  const tokenScale = 10n ** BigInt(tokenDecimals);
  const tokenUnits = (ngnMinor * tokenScale + rate - 1n) / rate;
  return fromBaseUnits(tokenUnits, tokenDecimals);
}

export function withdrawalUsdcEstimate(
  amountNgn: string,
  currencyDecimals: number,
  tokenDecimals: number,
  ngnMinorPerUsdc: string,
  feeBps: number
): { feeNgn: string; receiveUsdc: string } {
  const amount = toBaseUnits(amountNgn, currencyDecimals);
  const rate = BigInt(ngnMinorPerUsdc);
  if (amount <= 0n || rate <= 0n) return { feeNgn: "0", receiveUsdc: "0" };

  const fee = (amount * BigInt(Math.max(0, Math.min(10_000, Math.trunc(feeBps))))) / 10_000n;
  const net = amount - fee;
  const tokenUnits = (net * 10n ** BigInt(tokenDecimals)) / rate;
  return {
    feeNgn: fromBaseUnits(fee, currencyDecimals),
    receiveUsdc: fromBaseUnits(tokenUnits, tokenDecimals),
  };
}

export function fixedNgnPerUsdc(rateMinor: string, currencyDecimals: number): string {
  return fromBaseUnits(BigInt(rateMinor), currencyDecimals);
}

export function usdcUnitsToNgn(
  tokenUnits: bigint,
  tokenDecimals: number,
  currencyDecimals: number,
  ngnMinorPerUsdc: string
): string {
  const ngnMinor = (tokenUnits * BigInt(ngnMinorPerUsdc)) / 10n ** BigInt(tokenDecimals);
  return fromBaseUnits(ngnMinor, currencyDecimals);
}
