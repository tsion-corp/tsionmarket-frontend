"use client";

import { useQuery } from "@tanstack/react-query";
import { usePrivy } from "@privy-io/react-auth";
import { apiFetch } from "@/lib/api";
import { getWalletAddress } from "@/lib/user";
import type { Portfolio } from "@/lib/server/alchemy";

export type { Portfolio, TokenBalance } from "@/lib/server/alchemy";

const THIRTY_SECONDS = 30 * 1000;

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
      if (!res.ok) throw new Error("Portfolio request failed");
      return res.json();
    },
    staleTime: THIRTY_SECONDS,
    refetchInterval: THIRTY_SECONDS,
  });

  return {
    totalUsd: query.data?.totalUsd ?? 0,
    tokens: query.data?.tokens ?? [],
    loading: enabled && query.isPending,
    error: query.isError,
    refetch: query.refetch,
  };
}
