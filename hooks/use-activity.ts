"use client";

import { useQuery } from "@tanstack/react-query";
import { usePrivy } from "@privy-io/react-auth";
import { apiFetch } from "@/lib/api";
import { getWalletAddress } from "@/lib/user";
import type { ActivityItem } from "@/lib/server/activity";

export type { ActivityItem } from "@/lib/server/activity";

// History changes only when a transaction lands, so a slow poll is plenty;
// anything that needs to see its own effect immediately calls refetch().
const POLL_MS = 60_000;
const EMPTY: ActivityItem[] = [];

export function useActivity() {
  const { user, ready, authenticated } = usePrivy();
  const evm = getWalletAddress(user, "ethereum");
  const solana = getWalletAddress(user, "solana");
  const enabled = ready && authenticated && Boolean(evm || solana);

  const query = useQuery<{ items: ActivityItem[] }>({
    queryKey: ["activity", evm, solana],
    enabled,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (evm) params.set("evm", evm);
      if (solana) params.set("solana", solana);
      const res = await apiFetch(`/api/activity?${params.toString()}`, {}, { requireAuth: true });
      if (!res.ok) {
        throw new Error(
          res.status === 429 ? "Too many requests, try again shortly" : "Could not load activity"
        );
      }
      return res.json();
    },
    refetchInterval: POLL_MS,
    staleTime: POLL_MS,
    retry: (count, error) =>
      !(error instanceof Error && error.message.toLowerCase().includes("too many")) && count < 2,
  });

  return {
    items: query.data?.items ?? EMPTY,
    loading: query.isLoading,
    error: query.isError,
    refetch: query.refetch,
  };
}
