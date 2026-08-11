// How the portfolio splits across kinds of asset, for the donut on the balance
// card. Pure: no framework, no network, so the maths is unit tested.

import type { TokenBalance } from "@/lib/server/alchemy";

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
    if (!(token.valueUsd > 0)) continue;
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
  return tokens.reduce((n, t) => (t.valueUsd > 0 ? n + 1 : n), 0);
}
