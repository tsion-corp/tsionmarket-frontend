"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  DEPOSIT_CHAINS_KEY,
  MASTER_ELIGIBILITY_KEY,
  depositTokensKey,
  fetchDepositChains,
  fetchDepositTokens,
  fetchMasterEligibility,
} from "@/hooks/use-deposit";
import { SETTLE_CHAINS, SETTLE_ORDER } from "@/lib/deposit";
import { PERSISTED_GC_TIME } from "@/lib/query-persist";

const ONE_HOUR = 60 * 60 * 1000;
const PREFETCH_OPTS = { staleTime: ONE_HOUR, gcTime: PERSISTED_GC_TIME } as const;

interface MasterEligibility {
  keys: string[];
  chainIds: number[];
}

// Warms the persisted catalog on platform entry so the deposit picker opens
// instantly with networks already in the store: the chains list, the
// solver-eligible token set, then tokens for the 4 settlement chains only.
// Every other origin chain's tokens load on demand when its network is first
// picked. Runs once, in the background, never blocks render, and never lets a
// single failed request abort the rest — a network the burst missed refetches
// when the deposit screen mounts (see CATALOG_OPTIONS in use-deposit).
export function usePrefetchDepositCatalog() {
  const queryClient = useQueryClient();

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      // prefetchQuery (not fetchQuery) so a failure resolves rather than
      // rejects: one bad request must not abort warming the rest.
      await Promise.all([
        queryClient.prefetchQuery({
          queryKey: DEPOSIT_CHAINS_KEY,
          queryFn: fetchDepositChains,
          ...PREFETCH_OPTS,
        }),
        queryClient.prefetchQuery({
          queryKey: MASTER_ELIGIBILITY_KEY,
          queryFn: fetchMasterEligibility,
          ...PREFETCH_OPTS,
        }),
      ]);
      if (cancelled) return;

      // Read eligibility back from cache; if it didn't load, skip token
      // warming — each network's tokens still fetch on demand when picked.
      const eligibility = queryClient.getQueryData<MasterEligibility>(MASTER_ELIGIBILITY_KEY);
      if (!eligibility) return;
      const eligible = new Set(eligibility.keys);

      for (const key of SETTLE_ORDER) {
        if (cancelled) return;
        const chainId = SETTLE_CHAINS[key].chainId;
        await queryClient
          .prefetchQuery({
            queryKey: depositTokensKey(chainId),
            queryFn: () => fetchDepositTokens(chainId, eligible),
            ...PREFETCH_OPTS,
          })
          .catch(() => {});
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [queryClient]);
}
