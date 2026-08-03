"use client";

import { useCallback, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
const POLL_MS = 20 * 1000;

// Stable identity for the empty/loading state. Consumers key memos and effects
// on `tokens` (trade balances, swap net-balances, global search, funding), so a
// fresh `[]` each render would invalidate all of them needlessly.
const EMPTY_TOKENS: TokenBalance[] = [];

// How long to keep asking after a trade before giving up and leaving it to the
// background poll. A freshly created Solana token account can take several
// seconds to appear in the balance index, well past the transaction's own
// confirmation.
const SETTLE_DEADLINE_MS = 40_000;
const SETTLE_BACKOFF_MS = [0, 1_500, 3_000, 5_000, 5_000, 8_000, 8_000];

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// A fingerprint of the exact balances, so a post-trade poll can tell "the index
// caught up" from "the same snapshot again". Uses the base-unit strings, since
// the float `balance` can round two different amounts to the same value.
function balancesSignature(p: Portfolio | undefined): string {
  if (!p) return "";
  return p.tokens
    .map((t) => `${t.network}:${t.address ?? t.symbol}:${t.rawBalance}`)
    .sort()
    .join("|");
}

export function usePortfolio() {
  const { user, ready, authenticated } = usePrivy();
  const queryClient = useQueryClient();
  const evm = getWalletAddress(user, "ethereum");
  const solana = getWalletAddress(user, "solana");
  const enabled = ready && authenticated && Boolean(evm || solana);

  // Set while waiting for a just-made trade to show up, so those reads skip the
  // server's shared cache. A ref because the queryFn must see the current value
  // without the query being re-created.
  const forceFreshRef = useRef(false);

  const query = useQuery<Portfolio>({
    queryKey: ["portfolio", evm, solana],
    enabled,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (evm) params.set("evm", evm);
      if (solana) params.set("solana", solana);
      if (forceFreshRef.current) params.set("fresh", "1");
      // requireAuth: the query only runs when Privy is authenticated, so a
      // missing token means it isn't warm yet on a cold first load. apiFetch
      // then throws a retryable error instead of a token-less request that 401s.
      const res = await apiFetch(`/api/portfolio?${params.toString()}`, {}, { requireAuth: true });
      if (!res.ok) {
        // Message must say "too many requests" so the retry guard below
        // recognizes a 429 and stops retrying instead of piling more requests
        // onto an already-throttled key.
        throw new Error(res.status === 429 ? "Too many requests" : "Portfolio request failed");
      }
      return res.json();
    },
    // First load races the Privy token warm-up and a cold serverless start, so
    // retry longer than the global default (~13s across attempts) to outlast
    // both. Without this, the two quick default retries give up before the
    // token lands and the user has to refresh manually. A rate limit is never
    // retried, since a throttled key won't recover by retrying.
    retry: (failureCount, error) => {
      if (error.message.toLowerCase().includes("too many requests")) return false;
      return failureCount < 5;
    },
    retryDelay: (attempt) => Math.min(800 * 2 ** attempt, 4000),
    staleTime: POLL_MS,
    refetchInterval: POLL_MS,
  });

  const { refetch } = query;
  // Refetch until the balances actually move. A single refetch after a trade
  // races two lags — the shared server cache and Alchemy's balance index — and
  // usually loses, leaving the pre-trade numbers on screen until the next
  // background poll. Resolves true when the change lands, false on timeout.
  //
  // The baseline is read from the cache rather than from `query`, which would
  // make the callback change identity on every refetch and restart the poll.
  const refetchUntilChanged = useCallback(async (): Promise<boolean> => {
    const before = balancesSignature(
      queryClient.getQueryData<Portfolio>(["portfolio", evm, solana])
    );
    const startedAt = Date.now();
    forceFreshRef.current = true;
    try {
      for (let attempt = 0; Date.now() - startedAt < SETTLE_DEADLINE_MS; attempt++) {
        await delay(SETTLE_BACKOFF_MS[Math.min(attempt, SETTLE_BACKOFF_MS.length - 1)]);
        const { data } = await refetch();
        if (balancesSignature(data) !== before) return true;
      }
      return false;
    } finally {
      forceFreshRef.current = false;
    }
  }, [refetch, queryClient, evm, solana]);

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
    refetchUntilChanged,
  };
}
