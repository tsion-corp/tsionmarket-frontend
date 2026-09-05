"use client";

import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listPositions } from "@/features/trade/lib/hyperliquid-api";
import type { HlPositionView } from "@/features/trade/lib/hyperliquid-types";

// Mirrors features/trade/hooks/use-perp-positions.ts's shape for the
// Hyperliquid domain. No background poll: every action this app can take on
// a position (open, close, TP/SL) already refetches explicitly on
// completion (see hyperliquid-actions.ts's callers). A resting TP/SL or a
// liquidation firing with no user action in this tab is still caught by the
// app-wide refetchOnWindowFocus/refetchOnReconnect defaults
// (lib/query-client.ts) the next time this tab is actually looked at —
// this hook just no longer pays for a fetch every few seconds regardless.
const SETTLE_POLL_MS = 3_000;
const SETTLE_MAX_ATTEMPTS = 10;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function useHyperliquidPositions(walletId: string | null, enabled = true) {
  const queryClient = useQueryClient();

  const query = useQuery<HlPositionView[]>({
    queryKey: ["hl-positions", walletId],
    queryFn: () => listPositions(walletId as string),
    enabled: enabled && walletId != null,
    // The backend's reconciliation sweep corrects state the WS missed
    // (ghost positions, resolved orders) — without a background poll those
    // fixes stayed invisible until the user clicked something, which read
    // as "I closed it but it still shows open".
    refetchInterval: 15_000,
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
