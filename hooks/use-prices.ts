"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

// Matches usePortfolio's poll interval — same backend, same reasoning.
const POLL_MS = 60 * 1000;

// Stable identity for the loading/empty state so consumers keying memos or
// effects on the prices map don't churn every render.
const EMPTY_PRICES: Record<string, number> = {};

class PriceRequestError extends Error {
  constructor(readonly status: number) {
    super(status === 429 ? "Too many requests" : "Prices request failed");
  }
}

interface PriceWaiter {
  symbols: readonly string[];
  resolve: (prices: Record<string, number>) => void;
  reject: (error: unknown) => void;
}

let queued: PriceWaiter[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

// Dashboard sections mount together but ask for overlapping symbol sets. Fold
// those requests into one provider call instead of letting each component and
// each retry consume a separate Alchemy rate-limit slot.
function fetchPriceBatch(symbols: readonly string[]): Promise<Record<string, number>> {
  return new Promise((resolve, reject) => {
    queued.push({ symbols, resolve, reject });
    if (flushTimer !== null) return;
    flushTimer = setTimeout(async () => {
      flushTimer = null;
      const batch = queued;
      queued = [];
      const requested = [...new Set(batch.flatMap((waiter) => waiter.symbols))].sort();
      const params = new URLSearchParams();
      for (const symbol of requested) params.append("symbols", symbol);
      try {
        // Anonymous on purpose. This response is identical for every caller,
        // and a request carrying an Authorization header can never be stored by
        // a shared cache, so sending credentials here would make the route's
        // s-maxage inert.
        const res = await apiFetch(
          `/api/prices?${params.toString()}`,
          {},
          {
            anonymous: true,
          }
        );
        if (!res.ok) throw new PriceRequestError(res.status);
        const body = await res.json();
        const all: Record<string, number> = {};
        for (const price of body.prices ?? []) all[price.symbol] = price.priceUsd;
        for (const waiter of batch) {
          const selected: Record<string, number> = {};
          for (const symbol of waiter.symbols) {
            if (all[symbol] !== undefined) selected[symbol] = all[symbol];
          }
          waiter.resolve(selected);
        }
      } catch (error) {
        for (const waiter of batch) waiter.reject(error);
      }
    }, 25);
  });
}

export function usePrices(symbols: string[]) {
  const key = [...new Set(symbols)].sort();
  const { data } = useQuery<Record<string, number>>({
    queryKey: ["prices", key],
    enabled: symbols.length > 0,
    queryFn: () => fetchPriceBatch(key),
    staleTime: POLL_MS,
    refetchInterval: POLL_MS,
    // Retrying a throttled request from every mounted section amplifies the
    // outage. Wait for the next normal interval instead.
    retry: (failureCount, error) =>
      !(error instanceof PriceRequestError && error.status === 429) && failureCount < 2,
    retryDelay: (attempt) => Math.min(2_000 * 2 ** attempt, 30_000),
  });
  return data ?? EMPTY_PRICES;
}
