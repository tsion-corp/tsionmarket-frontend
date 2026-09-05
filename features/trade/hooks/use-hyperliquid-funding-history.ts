"use client";

import { useQuery } from "@tanstack/react-query";
import { getFundingHistory } from "@/features/trade/lib/hyperliquid-api";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const POLL_MS = 60_000;

// Market-wide funding-rate history for the selected asset — a REST poll
// (funding settles hourly on Hyperliquid, so sub-minute freshness buys
// nothing here), windowed to the last 7 days to match the reference chart.
export function useHyperliquidFundingHistory(symbol: string | null, enabled = true) {
  const query = useQuery({
    queryKey: ["hl-funding-history", symbol],
    queryFn: () => getFundingHistory(symbol as string, Date.now() - SEVEN_DAYS_MS),
    enabled: enabled && Boolean(symbol),
    refetchInterval: POLL_MS,
  });
  return { history: query.data ?? [], loading: query.isLoading };
}
