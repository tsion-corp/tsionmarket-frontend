"use client";

import { useQuery } from "@tanstack/react-query";

const TEN_MINUTES = 10 * 60 * 1000;

interface FxResponse {
  rates: Record<string, number>;
  updatedAt: string;
}

export function useFx() {
  const { data } = useQuery<FxResponse>({
    queryKey: ["fx-rates"],
    queryFn: async () => {
      const res = await fetch("/api/fx");
      if (!res.ok) throw new Error("FX request failed");
      return res.json();
    },
    staleTime: TEN_MINUTES,
    refetchInterval: TEN_MINUTES,
  });

  const rates = data?.rates ?? {};
  return {
    rates,
    updatedAt: data?.updatedAt ?? "",
    rate: (code: string) => (code === "USD" ? 1 : (rates[code] ?? null)),
  };
}
