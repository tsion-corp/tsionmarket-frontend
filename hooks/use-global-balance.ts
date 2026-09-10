"use client";

import { useQuery } from "@tanstack/react-query";
import { usePrivy } from "@privy-io/react-auth";
import { createServiceClient } from "@/lib/api/service";
import { getWalletAddress } from "@/lib/user";
import { usePortfolio } from "@/hooks/use-portfolio";

// Same gateway proxy features/trade/lib/hyperliquid-api.ts talks to — a
// second, minimal client here rather than importing that feature's hook
// directly, since features never import each other. Only the one read this
// hook needs.
const perp = createServiceClient("/api/perp", "The perps service is unavailable right now.");

const POLL_MS = 20 * 1000;

async function fetchPerpsBalance(address: string): Promise<number> {
  const state = await perp.authedGet<{ withdrawable: string }>(`/ark/account-state/${address}`);
  return Number(state.withdrawable);
}

// A wallet's balance across everything it holds today: spot/token holdings
// (usePortfolio's own totalUsd, untouched) plus its perps wallet
// balance. Deliberately a separate figure rather than folded into
// usePortfolio itself — that total already feeds analytics
// (components/providers/analytics-segments.tsx) and the remit flow's
// spendable-amount check (features/remit/components/amount-step.tsx), where
// perps margin would be the wrong number: it isn't spendable there without
// first withdrawing it back, a multi-minute round trip.
//
// Games/vault balance is intentionally excluded: world-street-vault has no
// per-user balance concept anywhere today (not in its database, and on-chain
// only a rare pendingWithdrawals fallback-credit) — showing a real games
// balance here needs a new per-user endpoint on that service first.
export function useGlobalBalance() {
  const { user, ready, authenticated } = usePrivy();
  const address = getWalletAddress(user, "ethereum");
  const spot = usePortfolio();

  const enabled = ready && authenticated && Boolean(address);
  const perpsQuery = useQuery<number>({
    queryKey: ["perps-balance", address],
    enabled,
    queryFn: () => fetchPerpsBalance(address as string),
    refetchInterval: POLL_MS,
  });

  // A perps balance that hasn't loaded yet, or a wallet that's never traded
  // perps, counts as 0 rather than blocking or delaying the spot total —
  // this figure is additive, not authoritative.
  const perpsUsd = perpsQuery.data ?? 0;

  return {
    totalUsd: spot.totalUsd + perpsUsd,
    spotUsd: spot.totalUsd,
    perpsUsd,
    loading: spot.loading,
  };
}
