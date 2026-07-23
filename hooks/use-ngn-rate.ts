"use client";

import { useQuery } from "@tanstack/react-query";
import { FALLBACK_NGN_RATE, fetchNgnRate } from "@/lib/rates";

const TEN_MINUTES = 10 * 60 * 1000;

// Live USD to NGN rate, polled while the page is open. Falls back to the
// demo constant until the first fetch lands or when the API is down.
export function useNgnRate() {
  const { data, isSuccess } = useQuery({
    queryKey: ["usd-ngn-rate"],
    queryFn: fetchNgnRate,
    staleTime: TEN_MINUTES,
    refetchInterval: TEN_MINUTES,
    retry: 2,
  });
  return {
    rate: data?.rate ?? FALLBACK_NGN_RATE.rate,
    updatedAt: data?.updatedAt ?? "",
    live: isSuccess,
  };
}
