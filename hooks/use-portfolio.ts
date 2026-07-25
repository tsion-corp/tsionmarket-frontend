"use client";

import { useQuery } from "@tanstack/react-query";
import { usePrivy } from "@privy-io/react-auth";
import { apiFetch } from "@/lib/api";
import { getWalletAddress } from "@/lib/user";
import type { Portfolio } from "@/lib/server/alchemy";

import type { TokenBalance } from "@/lib/server/alchemy";

export type { Portfolio, TokenBalance } from "@/lib/server/alchemy";

// Balances don't need second-by-second freshness, and every tick here is a
// round trip through our now-cached but still real Alchemy call — a minute
// is plenty for background polling. Anything that needs to see its own
// effect immediately (e.g. right after a trade or withdrawal) calls
// `refetch()` directly instead of waiting on this interval.
const POLL_MS = 60 * 1000;

// Stable identity for the empty/loading state. Consumers key memos and effects
// on `tokens` (trade balances, swap net-balances, global search, funding), so a
// fresh `[]` each render would invalidate all of them needlessly.
const EMPTY_TOKENS: TokenBalance[] = [];

export function usePortfolio() {
  const { user, ready, authenticated } = usePrivy();
  const evm = getWalletAddress(user, "ethereum");
  const solana = getWalletAddress(user, "solana");
  const enabled = ready && authenticated && Boolean(evm || solana);

  const query = useQuery<Portfolio>({
    queryKey: ["portfolio", evm, solana],
    enabled,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (evm) params.set("evm", evm);
      if (solana) params.set("solana", solana);
      const res = await apiFetch(`/api/portfolio?${params.toString()}`);
      if (!res.ok) {
        // Message must say "too many requests" so the global retry guard
        // (lib/query-client.ts) recognizes a 429 and stops retrying instead
        // of piling more requests onto an already-throttled key.
        throw new Error(res.status === 429 ? "Too many requests" : "Portfolio request failed");
      }
      return res.json();
    },
    staleTime: POLL_MS,
    refetchInterval: POLL_MS,
  });

  return {
    totalUsd: query.data?.totalUsd ?? 0,
    tokens: query.data?.tokens ?? EMPTY_TOKENS,
    loading: enabled && query.isPending,
    // True while a fresh fetch is in flight but a value (possibly a
    // rehydrated one from a previous session) is already on screen — lets
    // the UI show a subtle "refreshing" hint instead of silently swapping
    // numbers with no explanation.
    refreshing: enabled && query.isFetching && !query.isPending,
    error: query.isError,
    refetch: query.refetch,
  };
}
