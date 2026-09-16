export function formatUsdcVolume(value: string): string {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return "-";
  if (amount > 0 && amount < 0.01) return "<0.01 USDC";
  if (amount >= 1_000_000) return `${trimFixed(amount / 1_000_000, 1)}M USDC`;
  if (amount >= 1_000) return `${trimFixed(amount / 1_000, 1)}K USDC`;
  return `${trimFixed(amount, 2)} USDC`;
}

export function formatTokenVolumeAsUsdc(
  value: string,
  symbol: string,
  ethPriceUsd: number
): string {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return "-";
  const normalized = symbol.trim().toUpperCase();
  if (["USDC", "USDT", "USDC.E"].includes(normalized)) return formatUsdcVolume(value);
  if ((normalized === "WETH" || normalized === "ETH") && ethPriceUsd > 0) {
    return formatUsdcVolume(String(amount * ethPriceUsd));
  }
  return "-";
}

function trimFixed(value: number, fractionDigits: number): string {
  return value
    .toFixed(fractionDigits)
    .replace(/\.0+$/u, "")
    .replace(/(\.\d*?)0+$/u, "$1");
}
