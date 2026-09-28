import { formatUnits } from "viem";

export function formatArkEth(wei: string): string {
  const amount = formatUnits(BigInt(wei), 18);
  return amount.includes(".") ? amount.replace(/0+$/, "").replace(/\.$/, "") : amount;
}

export function secondsUntil(iso: string, now = Date.now()): number {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - now) / 1000));
}
