"use client";

import { useQuery } from "@tanstack/react-query";
import { PERSISTED_GC_TIME } from "@/lib/query-persist";
import type { Prediction } from "@/lib/types";

const FIVE_MINUTES = 5 * 60 * 1000;

export function usePredictions() {
  return useQuery<Prediction[]>({
    queryKey: ["predictions"],
    staleTime: FIVE_MINUTES,
    gcTime: PERSISTED_GC_TIME,
    queryFn: async () => {
      const res = await fetch("/api/predictions");
      if (!res.ok) throw new Error("Could not load predictions");
      const data = await res.json();
      return (data.predictions ?? []) as Prediction[];
    },
  });
}
