"use client";

import { useQuery } from "@tanstack/react-query";
import {
  getLpPositions,
  getMyMarkets,
  getPositions,
  getPositionsForMarket,
} from "@/features/prediction/lib/api";
import { readPendingWithdrawals } from "@/features/prediction/lib/chain-reads";
import { useAuthSession } from "@/hooks/use-auth-session";

// Portfolio reads for the connected wallet: open positions and LP positions from
// the indexer, the markets the wallet created, and the claimable balance from the
// contract.

// Markets the connected wallet created (by on-chain creator), so they can resolve
// their own markets even before the indexer backfills the creator field.
export function useMyMarkets() {
  const { evmAddress: wallet } = useAuthSession();
  return useQuery({
    queryKey: ["prediction", "my-markets", wallet],
    queryFn: () => getMyMarkets(wallet as string),
    enabled: !!wallet,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}

export function usePositions() {
  const { evmAddress: wallet } = useAuthSession();
  return useQuery({
    queryKey: ["prediction", "positions", wallet],
    queryFn: () => getPositions(wallet as string),
    enabled: !!wallet,
    staleTime: 10_000,
    refetchInterval: 20_000,
  });
}

// The connected wallet's positions in ONE market (both sides), for the detail
// page's positions panel. Disabled until a wallet + market id are known.
export function useMarketPositions(marketId: string | null) {
  const { evmAddress: wallet } = useAuthSession();
  return useQuery({
    queryKey: ["prediction", "market-positions", marketId, wallet],
    queryFn: () => getPositionsForMarket(marketId as string, wallet as string),
    enabled: !!wallet && !!marketId,
    staleTime: 10_000,
    refetchInterval: 20_000,
  });
}

export function useLpPositions() {
  const { evmAddress: wallet } = useAuthSession();
  return useQuery({
    queryKey: ["prediction", "lp", wallet],
    queryFn: () => getLpPositions(wallet as string),
    enabled: !!wallet,
    staleTime: 10_000,
    refetchInterval: 20_000,
  });
}

export function usePendingWithdrawals() {
  const { evmAddress: wallet } = useAuthSession();
  return useQuery({
    queryKey: ["prediction", "withdrawable", wallet],
    queryFn: () => readPendingWithdrawals(wallet as string),
    enabled: !!wallet,
    staleTime: 15_000,
    refetchInterval: 20_000,
  });
}
