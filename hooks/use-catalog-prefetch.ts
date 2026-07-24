"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  DEPOSIT_CHAINS_KEY,
  depositTokensKey,
  fetchDepositChains,
  fetchDepositTokens,
} from "@/hooks/use-deposit";
import { SETTLE_CHAINS, SETTLE_ORDER } from "@/lib/deposit";
import { PERSISTED_GC_TIME } from "@/lib/query-persist";

const ONE_HOUR = 60 * 60 * 1000;
const PREFETCH_OPTS = { staleTime: ONE_HOUR, gcTime: PERSISTED_GC_TIME } as const;

// Warms the persisted cache on dashboard load: the chains list, then tokens for
// the 4 settlement chains only, so the deposit picker opens instantly. Every
// other origin chain's tokens load on demand when its tab is first opened.
// Runs once, in the background, and never blocks render.
export function usePrefetchDepositCatalog() {
  const queryClient = useQueryClient();

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      await queryClient.prefetchQuery({
        queryKey: DEPOSIT_CHAINS_KEY,
        queryFn: fetchDepositChains,
        ...PREFETCH_OPTS,
      });
      // Gradually warm the settlement chains' tokens, one at a time.
      for (const key of SETTLE_ORDER) {
        if (cancelled) return;
        const chainId = SETTLE_CHAINS[key].chainId;
        await queryClient
          .prefetchQuery({
            queryKey: depositTokensKey(chainId),
            queryFn: () => fetchDepositTokens(chainId),
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
