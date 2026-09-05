"use client";

import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePrivy } from "@privy-io/react-auth";
import { fetchPerpOrders, isPerpUnavailable } from "@/lib/perp/api";
import { getWalletAddress } from "@/lib/user";
import type { PerpOrder } from "@/lib/perp/types";
import { pollUnlessFailing } from "@/lib/query-poll";

// The trader's pending (unfilled) limit and stop orders. They change on two
// events only — the user places or cancels one, or the keeper fills one at its
// trigger — so the background poll is slow and the moments that matter
// (after a cancel) poll actively with waitForChange, like positions do.

const ORDERS_POLL_MS = 20_000;
const SETTLE_POLL_MS = 4_000;
const SETTLE_MAX_ATTEMPTS = 12;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function usePerpOrders(enabled = true) {
  const { user } = usePrivy();
  const queryClient = useQueryClient();
  const trader = getWalletAddress(user, "ethereum");

  const query = useQuery<PerpOrder[]>({
    queryKey: ["perp-orders", trader],
    queryFn: () => fetchPerpOrders(trader as string),
    enabled: enabled && trader != null,
    refetchInterval: pollUnlessFailing(ORDERS_POLL_MS),
    retry: (count, error) => !isPerpUnavailable(error) && count < 2,
  });

  // Polls until an expected transition is visible (an order cleared after a
  // cancel or a fill). Resolves false when it never showed inside the window,
  // so the caller words its toast honestly.
  const waitForChange = useCallback(
    async (changed: (orders: PerpOrder[]) => boolean): Promise<boolean> => {
      if (!trader) return false;
      for (let attempt = 0; attempt < SETTLE_MAX_ATTEMPTS; attempt++) {
        await delay(SETTLE_POLL_MS);
        try {
          const fresh = await fetchPerpOrders(trader);
          // Keep an older in-flight poll from overwriting this snapshot.
          await queryClient.cancelQueries({ queryKey: ["perp-orders", trader] });
          queryClient.setQueryData(["perp-orders", trader], fresh);
          if (changed(fresh)) return true;
        } catch {
          // A transient poll failure just means try again on the next tick.
        }
      }
      return false;
    },
    [trader, queryClient]
  );

  return {
    orders: query.data ?? [],
    loading: query.isLoading,
    error: query.isError && !isPerpUnavailable(query.error) ? query.error : null,
    refetch: query.refetch,
    waitForChange,
    trader,
  };
}
