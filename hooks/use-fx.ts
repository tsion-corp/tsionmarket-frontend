"use client";

import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

const TEN_MINUTES = 10 * 60 * 1000;

const EMPTY_RATES: Record<string, number> = {};

interface FxResponse {
  rates: Record<string, number>;
  updatedAt: string;
}

export function useFx() {
  const { data } = useQuery<FxResponse>({
    queryKey: ["fx-rates"],
    queryFn: async () => {
      // Anonymous on purpose. This response is identical for every caller,
      // and a request carrying an Authorization header can never be stored by
      // a shared cache, so sending credentials here would make the route's
      // s-maxage inert.
      const res = await apiFetch("/api/fx", {}, { anonymous: true });
      if (!res.ok) throw new Error("FX request failed");
      return res.json();
    },
    staleTime: TEN_MINUTES,
    refetchInterval: TEN_MINUTES,
  });

  const rates = data?.rates ?? EMPTY_RATES;
  const updatedAt = data?.updatedAt ?? "";
  // Stable identities so consumers can safely put `rate`/`rates` in dep arrays.
  const rate = useCallback((code: string) => (code === "USD" ? 1 : (rates[code] ?? null)), [rates]);
  return useMemo(() => ({ rates, updatedAt, rate }), [rates, updatedAt, rate]);
}
