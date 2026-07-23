"use client";

import { useQuery } from "@tanstack/react-query";
import { RANGE_DAYS, type ChartRange } from "@/lib/coingecko";

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

export function useChart(id: string | null, range: ChartRange, type: "area" | "candles" = "area") {
  const { data, isPending, isError } = useQuery<{ points: (AreaPoint | CandlePoint)[] }>({
    queryKey: ["chart", id, range, type],
    enabled: Boolean(id),
    queryFn: async () => {
      const params = new URLSearchParams({ id: id!, days: RANGE_DAYS[range], type });
      const res = await fetch(`/api/chart?${params.toString()}`);
      if (!res.ok) throw new Error("Chart request failed");
      return res.json();
    },
    staleTime: FIVE_MINUTES,
    refetchInterval: FIVE_MINUTES,
  });

  return { points: data?.points ?? [], loading: Boolean(id) && isPending, error: isError };
}
