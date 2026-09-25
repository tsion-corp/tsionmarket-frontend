"use client";

// The wallet venue: plain token balances at the old addresses, the case the
// one-click button always covered. Discovery reads the portfolio for the OLD
// wallets (the route accepts any addresses; auth only gates our Alchemy key)
// and settles through the existing sweep.

import { apiFetch } from "@/lib/api";
import { apiError } from "@/lib/api/envelope";
import type { Portfolio } from "@/lib/server/alchemy";
import { holdingId } from "@/lib/migration/holding";
import type { LegacyHolding, SettleOutcome, VenueAdapter } from "@/lib/migration/types";
import { buildSweepPlan, groupSweepAssets, type SweepAsset } from "@/features/migrate/lib/plan";
import { runSweep } from "@/features/migrate/lib/sweep";

const NETWORK_LABELS: Record<string, string> = {
  "eth-mainnet": "Ethereum",
  "base-mainnet": "Base",
  "arb-mainnet": "Arbitrum",
  "opt-mainnet": "Optimism",
  "polygon-mainnet": "Polygon",
  "solana-mainnet": "Solana",
};

function label(asset: SweepAsset): string {
  return `${asset.symbol} on ${NETWORK_LABELS[asset.network] ?? asset.network}`;
}

// Pure: portfolio rows to holdings. Exported for its test.
export function walletHoldings(tokens: Portfolio["tokens"]): LegacyHolding<SweepAsset>[] {
  const { chains, skipped } = buildSweepPlan(tokens);
  const sweepable = chains.flatMap((chain) => chain.assets);
  const toHolding = (asset: SweepAsset, stranded: boolean): LegacyHolding<SweepAsset> => ({
    id: holdingId("wallet", asset.tokenAddress === null ? "native" : "token", asset.id),
    venue: "wallet",
    kind: asset.tokenAddress === null ? "native" : "token",
    label: label(asset),
    amount: asset.amount,
    decimals: asset.decimals,
    symbol: asset.symbol,
    valueUsd: asset.valueUsd,
    deterministic: true,
    irreversible: false,
    settleability: stranded
      ? { state: "stranded", reason: "unsponsoredNetwork" }
      : { state: "now" },
    ref: asset,
  });
  return [...sweepable.map((a) => toHolding(a, false)), ...skipped.map((a) => toHolding(a, true))];
}

export const walletAdapter: VenueAdapter<SweepAsset> = {
  venue: "wallet",
  requiresLegacySession: false,
  async discover({ legacy }) {
    if (!legacy.evm && !legacy.solana) return [];
    const params = new URLSearchParams();
    if (legacy.evm) params.set("evm", legacy.evm);
    if (legacy.solana) params.set("solana", legacy.solana);
    // fresh=1 skips the shared server cache: a review must see balances that
    // moved seconds ago, not a snapshot from before the last step.
    params.set("fresh", "1");
    // The whole old wallet, not just the contracts on the live portfolio's
    // allowlist — a held token the ranked catalogue never reached must still
    // be seen here, or it is never moved.
    params.set("scope", "legacy");
    const res = await apiFetch(`/api/portfolio?${params.toString()}`, {}, { requireAuth: true });
    // With the status: a 401 here is an expired session, which the card
    // sends back to sign-in rather than listing the wallet as unanswered.
    if (!res.ok) throw apiError("BAD_RESPONSE", "Couldn't check your old account.", res.status);
    const portfolio = (await res.json()) as Portfolio;
    return walletHoldings(portfolio.tokens);
  },
  async settle(holdings, ctx) {
    const outcomes = new Map<string, SettleOutcome>();
    // Destinations are checked per chain inside runSweep, not up front. Failing
    // the whole sweep unless BOTH addresses existed meant a session with no
    // Solana address could not move its Base USDC either — blocked on an
    // address nothing in the sweep was going to use.
    const chains = groupSweepAssets(holdings.map((h) => h.ref));
    const byAsset = await runSweep(
      chains,
      { evm: ctx.current.evm, solana: ctx.current.solana },
      ctx.signer
    );
    for (const h of holdings) {
      const outcome = byAsset.get(h.ref.id);
      if (outcome) outcomes.set(h.id, outcome);
    }
    return outcomes;
  },
};
