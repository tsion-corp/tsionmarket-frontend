"use client";

import { useQuery } from "@tanstack/react-query";
import { getWskBalance } from "@/lib/intertrain/rpc";

export const wskBalanceKey = (address: string | null) => ["wsk-balance", address] as const;

/** Native WSK (6 decimals) at an Intertrain address. Read when asked for, not polled. */
export function useWskBalance(address: string | null) {
  return useQuery({
    queryKey: wskBalanceKey(address),
    queryFn: () => getWskBalance(address as string),
    enabled: address !== null,
    staleTime: 20_000,
    retry: 1,
    refetchOnWindowFocus: false,
  });
}
