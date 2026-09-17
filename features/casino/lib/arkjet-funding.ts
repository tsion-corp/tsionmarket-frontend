import { fromBaseUnits, toBaseUnits } from "@/lib/trade/math";
import type { ArkjetFundingConfig } from "./api/arkjet";

const PLAIN_DECIMAL = /^\d*\.?\d*$/;

export function validateArkjetFundingConfig(config: ArkjetFundingConfig): ArkjetFundingConfig {
  if (
    config.currency !== "USDC" ||
    config.currencyDecimalPlaces !== 6 ||
    config.tokenDecimals !== 6 ||
    config.ledgerMinorPerUsdc !== "1000000"
  ) {
    throw Object.assign(
      new Error("Arkjet must be updated to native USDC before wallet funding is available."),
      {
        code: "NOT_CONFIGURED",
      }
    );
  }
  return config;
}

export function normalizeArkjetAmount(value: string, decimals: number): string | null {
  const cleaned = value.trim();
  if (!cleaned || !PLAIN_DECIMAL.test(cleaned)) return null;
  if ((cleaned.split(".")[1]?.length ?? 0) > decimals) return null;
  const units = toBaseUnits(cleaned, decimals);
  return units > 0n ? fromBaseUnits(units, decimals) : null;
}

export function amountUnits(value: string | null, decimals: number): bigint {
  return value === null ? 0n : toBaseUnits(value, decimals);
}

export function stepArkjetAmount(
  value: string,
  minimum: string,
  direction: "increase" | "decrease",
  decimals = 6
): string {
  const current = amountUnits(normalizeArkjetAmount(value, decimals), decimals);
  const step = amountUnits(normalizeArkjetAmount(minimum, decimals), decimals);
  const next = direction === "increase" ? current + step : current - step;
  const formatted = fromBaseUnits(next < step ? step : next, decimals);
  const [whole, fraction = ""] = formatted.split(".");
  return `${whole}.${fraction.padEnd(2, "0")}`;
}

export function withdrawalUsdcEstimate(
  amountUsdc: string,
  decimals: number,
  feeBps: number
): { feeUsdc: string; receiveUsdc: string } {
  const amount = toBaseUnits(amountUsdc, decimals);
  if (amount <= 0n) return { feeUsdc: "0", receiveUsdc: "0" };

  const fee = (amount * BigInt(Math.max(0, Math.min(10_000, Math.trunc(feeBps))))) / 10_000n;
  const net = amount - fee;
  return {
    feeUsdc: fromBaseUnits(fee, decimals),
    receiveUsdc: fromBaseUnits(net, decimals),
  };
}
