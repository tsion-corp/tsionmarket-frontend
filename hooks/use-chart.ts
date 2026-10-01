"use client";

import { useQuery } from "@tanstack/react-query";
import { RANGE_DAYS, type ChartRange } from "@/lib/coingecko";
import { apiFetch } from "@/lib/api";

export interface AreaPoint {
  time: number;
  value: number;
}

export interface CandlePoint {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

const FIVE_MINUTES = 5 * 60 * 1000;

const EMPTY_POINTS: (AreaPoint | CandlePoint)[] = [];

/**
 * Where a chart's series comes from.
 *
 * A listing, or a liquidity pool. The distinction is not a preference: a
 * memecoin that no exchange has listed has no CoinGecko id to ask for, and
 * about a third of the meme desk's rows are in that state. What every one of
 * them does have is the pool it trades in.
 *
 * The pool variant carries an optional `id` as well. A token can be both
 * listed and pooled, and the route tries the pool first and falls back to the
 * listing, so a pool that answers nothing is not the end of the chart.
 */
export type ChartSource =
  | { kind: "coingecko"; id: string }
  | { kind: "pool"; chain: string; pool: string; token: string; id?: string | null };

function paramsFor(source: ChartSource, range: ChartRange, type: string): URLSearchParams {
  const params = new URLSearchParams({ days: RANGE_DAYS[range], type });
  if (source.kind === "coingecko") {
    params.set("id", source.id);
    return params;
  }
  params.set("chain", source.chain);
  params.set("pool", source.pool);
  params.set("token", source.token);
  if (source.id) params.set("id", source.id);
  return params;
}

// The whole source, not just an id. Two sources can hold the same token and
// must not share a cache entry.
function keyFor(source: ChartSource | null): unknown {
  if (source === null) return null;
  return source.kind === "coingecko"
    ? ["coingecko", source.id]
    : ["pool", source.chain, source.pool, source.token];
}

export function useChart(
  source: ChartSource | null,
  range: ChartRange,
  type: "area" | "candles" = "area"
) {
  const { data, isPending, isError } = useQuery<{ points: (AreaPoint | CandlePoint)[] }>({
    queryKey: ["chart", keyFor(source), range, type],
    enabled: source !== null,
    queryFn: async () => {
      const res = await apiFetch(`/api/chart?${paramsFor(source!, range, type).toString()}`);
      if (!res.ok) throw new Error("Chart request failed");
      return res.json();
    },
    staleTime: FIVE_MINUTES,
    refetchInterval: FIVE_MINUTES,
  });

  return {
    points: data?.points ?? EMPTY_POINTS,
    loading: source !== null && isPending,
    error: isError,
  };
}
