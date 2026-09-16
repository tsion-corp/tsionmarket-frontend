// How the portfolio splits across kinds of asset, for the donut on the balance
// card. Pure: no framework, no network, so the maths is unit tested.

import type { TokenBalance } from "@/lib/server/alchemy";
import { isDustHolding } from "@/features/portfolio/lib/holdings";

/**
 * Whether a holding is worth a place in the allocation.
 *
 * It needs a value, or it has no share to draw. And it must not be dust: a
 * sub-cent position can only be printed as "<$0.01" at 0%, which describes
 * nothing, and straight after a full exit it reads as though the sale never
 * happened. The holdings list drops exactly these, so the drawer beside it
 * counts exactly the same set.
 *
 * Dust is excluded from the TOTAL as well as from the slices, so the shares
 * that remain still add up to the whole of what is drawn.
 */
function countsTowardAllocation(token: TokenBalance): boolean {
  return token.valueUsd > 0 && !isDustHolding(token);
}

// The order segments are drawn and listed in. Cash first because it is the
// number people look for, then the rest by how tradable they are.
export const BREAKDOWN_ORDER = ["cash", "coins", "realAssets", "tokens"] as const;
export type BreakdownKey = (typeof BREAKDOWN_ORDER)[number];

const KIND_TO_KEY: Record<TokenBalance["kind"], BreakdownKey> = {
  stablecoin: "cash",
  coin: "coins",
  rwa: "realAssets",
  token: "tokens",
};

export interface BreakdownSlice {
  key: BreakdownKey;
  valueUsd: number;
  // Share of the total, 0–1. Zero when the portfolio is empty.
  share: number;
  // How many holdings make up this slice.
  count: number;
}

// Spendable cash: the stablecoins, which are what a purchase actually draws on.
// A wallet can be worth a lot and still have nothing ready to spend.
export function readyToSpendUsd(tokens: TokenBalance[]): number {
  return tokens.reduce((sum, t) => (t.kind === "stablecoin" ? sum + t.valueUsd : sum), 0);
}

// Non-empty slices, largest first, sharing out of the total held. Slices worth
// nothing are dropped rather than drawn as a zero-width arc.
export function portfolioBreakdown(tokens: TokenBalance[]): BreakdownSlice[] {
  const totals = new Map<BreakdownKey, { valueUsd: number; count: number }>();
  let total = 0;
  for (const token of tokens) {
    if (!countsTowardAllocation(token)) continue;
    const key = KIND_TO_KEY[token.kind] ?? "tokens";
    const at = totals.get(key) ?? { valueUsd: 0, count: 0 };
    at.valueUsd += token.valueUsd;
    at.count += 1;
    totals.set(key, at);
    total += token.valueUsd;
  }
  if (total <= 0) return [];

  return BREAKDOWN_ORDER.filter((key) => totals.has(key))
    .map((key) => {
      const at = totals.get(key)!;
      return { key, valueUsd: at.valueUsd, share: at.valueUsd / total, count: at.count };
    })
    .sort((a, b) => b.valueUsd - a.valueUsd);
}

// How many holdings the donut is describing, which is what its centre reads.
export function heldAssetCount(tokens: TokenBalance[]): number {
  // The same set the slices are built from, or the ring's centre would promise
  // more assets than the legend beside it lists.
  return tokens.reduce((n, token) => (countsTowardAllocation(token) ? n + 1 : n), 0);
}
