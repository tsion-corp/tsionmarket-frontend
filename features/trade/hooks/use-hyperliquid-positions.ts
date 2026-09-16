"use client";

import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listPositions } from "@/features/trade/lib/hyperliquid-api";
import type { HlPositionView } from "@/features/trade/lib/hyperliquid-types";
import { positionsRefetchInterval } from "@/features/trade/lib/perps-polling";

// The wallet's open positions. Every action the desk takes on a position
// refetches it on completion; the background poll only watches for what
// happens with no click here (the mark moving, a trigger or liquidation
// firing, the backend's reconciliation sweep), and only while there is
// exposure to watch (see perps-polling.ts).
const SETTLE_POLL_MS = 3_000;
const SETTLE_MAX_ATTEMPTS = 10;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function useHyperliquidPositions(
  walletId: string | null,
  enabled = true,
  // A resting order can fill into a position with no action here, so the poll
  // keeps running while one exists, even before any position does.
  hasRestingOrders = false
) {
  const queryClient = useQueryClient();

  const query = useQuery<HlPositionView[]>({
    queryKey: ["hl-positions", walletId],
    queryFn: () => listPositions(walletId as string),
    enabled: enabled && walletId != null,
    refetchInterval: (query) => positionsRefetchInterval(query.state.data, hasRestingOrders),
  });

  const waitForChange = useCallback(
    async (changed: (positions: HlPositionView[]) => boolean): Promise<boolean> => {
      if (!walletId) return false;
      for (let attempt = 0; attempt < SETTLE_MAX_ATTEMPTS; attempt++) {
        await delay(SETTLE_POLL_MS);
        try {
          const fresh = await listPositions(walletId);
          await queryClient.cancelQueries({ queryKey: ["hl-positions", walletId] });
          queryClient.setQueryData(["hl-positions", walletId], fresh);
          if (changed(fresh)) return true;
        } catch {
          // A transient poll failure just means try again on the next tick.
        }
      }
      return false;
    },
    [walletId, queryClient]
  );

  return {
    positions: query.data ?? [],
    loading: query.isLoading,
    error: query.isError ? query.error : null,
    refetch: query.refetch,
    waitForChange,
  };
}
