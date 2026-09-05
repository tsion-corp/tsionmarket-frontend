"use client";

import { useQuery } from "@tanstack/react-query";
import { listClosedPositions } from "@/features/trade/lib/hyperliquid-api";
import type { HlClosedPositionView } from "@/features/trade/lib/hyperliquid-types";

// History is opened on demand from a modal — enabled only while it's open,
// so a wallet that never checks its history never pays for the request.
export function useHyperliquidClosedPositions(walletId: string | null, enabled: boolean) {
  const query = useQuery<HlClosedPositionView[]>({
    queryKey: ["hl-closed-positions", walletId],
    queryFn: () => listClosedPositions(walletId as string),
    enabled: enabled && walletId != null,
  });

  return {
    positions: query.data ?? [],
    loading: query.isLoading,
    error: query.isError ? query.error : null,
  };
}
