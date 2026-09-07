import { fromBaseUnits, toBaseUnits } from "@/lib/trade/math";

// Sell-side amounts are sized from the wallet's exact base-unit balance. The
// portfolio also carries a float for display; a float rendered at eighteen
// decimals invents digits the wallet never held, and the trade service refuses
// an amount one base unit over the balance.

export function maxSellAmount(rawBalance: string, decimals: number): string {
  return fromBaseUnits(BigInt(rawBalance), decimals);
}

export function exceedsHeld(amount: string, rawBalance: string, decimals: number): boolean {
  return toBaseUnits(amount, decimals) > BigInt(rawBalance);
}
