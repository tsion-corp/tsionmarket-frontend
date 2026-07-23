// Demo FX rate for display conversion. Real quotes come later from the pricing API.
export const NGN_PER_USD = 1580;

export function usdToNgn(usd: number): number {
  return usd * NGN_PER_USD;
}

export function formatUsd(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatNgn(n: number): string {
  return `₦${Math.round(n).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}
