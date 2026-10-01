const USDC_SCALE = 1_000_000n;

export function decimalOdds(valueE6: string): number {
  const value = Number(valueE6) / 1_000_000;
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export function formatDecimalOddsE6(valueE6: string): string {
  const odds = decimalOdds(valueE6);
  return odds < 1.01 ? odds.toFixed(4) : odds.toFixed(3);
}

export function stakeToE6(value: string): string | null {
  const normalized = value.trim();
  if (!/^\d+(?:\.\d{0,6})?$/.test(normalized)) return null;
  const [whole, fraction = ""] = normalized.split(".");
  return (BigInt(whole) * USDC_SCALE + BigInt(fraction.padEnd(6, "0"))).toString();
}

export function formatUsdcE6(value: string, maximumFractionDigits = 2): string {
  const amount = Number(value) / 1_000_000;
  if (!Number.isFinite(amount)) return "0.00";
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits,
  }).format(amount);
}

export function usdcInputFromE6(value: string | bigint): string {
  const atomic = typeof value === "bigint" ? value : BigInt(value);
  const whole = atomic / USDC_SCALE;
  const fraction = (atomic % USDC_SCALE).toString().padStart(6, "0").replace(/0+$/u, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}
