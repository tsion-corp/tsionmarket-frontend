"use client";

import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePrivy } from "@privy-io/react-auth";
import { fetchPerpPositions, isPerpUnavailable } from "@/lib/perp/api";
import { getWalletAddress } from "@/lib/user";
import type { OpenPosition } from "@/lib/perp/types";
import { pollUnlessFailing } from "@/lib/query-poll";

// The trader's open positions. Market opens and closes are keeper-executed
// with a few seconds of delay, so after a trade this is polled (not assumed)
// until the change lands; waitForPositions below does that with a bounded
// number of attempts at the doc's recommended cadence.

const POSITIONS_POLL_MS = 15_000;
const SETTLE_POLL_MS = 4_000;
const SETTLE_MAX_ATTEMPTS = 12;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function usePerpPositions(enabled = true) {
  const { user } = usePrivy();
  const queryClient = useQueryClient();
  const trader = getWalletAddress(user, "ethereum");

  const query = useQuery<OpenPosition[]>({
    queryKey: ["perp-positions", trader],
    queryFn: () => fetchPerpPositions(trader as string),
    enabled: enabled && trader != null,
    refetchInterval: pollUnlessFailing(POSITIONS_POLL_MS),
    retry: (count, error) => !isPerpUnavailable(error) && count < 2,
  });

  // Polls until the keeper's fill is visible: `changed` decides from a fresh
  // snapshot whether the expected transition happened (a position appeared,
  // cleared, or shrank). Resolves true when seen, false when it never showed
  // inside the window, so the caller can word its toast honestly.
  const waitForChange = useCallback(
    async (changed: (positions: OpenPosition[]) => boolean): Promise<boolean> => {
      if (!trader) return false;
      for (let attempt = 0; attempt < SETTLE_MAX_ATTEMPTS; attempt++) {
        await delay(SETTLE_POLL_MS);
        try {
          const fresh = await fetchPerpPositions(trader);
          // Keep an older in-flight poll from overwriting this snapshot.
          await queryClient.cancelQueries({ queryKey: ["perp-positions", trader] });
          queryClient.setQueryData(["perp-positions", trader], fresh);
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
    positions: query.data ?? [],
    loading: query.isLoading,
    error: query.isError && !isPerpUnavailable(query.error) ? query.error : null,
    refetch: query.refetch,
    waitForChange,
    trader,
  };
}
