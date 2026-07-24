"use client";

import { useQuery } from "@tanstack/react-query";

interface AccessResult {
  country: string | null;
  allowed: boolean;
}

const ONE_HOUR = 60 * 60 * 1000;

// Whether prediction trading is offered in the user's region. Fails open while
// loading or on error (default allowed), since Polymarket enforces the hard
// geoblock at order time; this only gates the UI affordances.
export function usePolymarketAccess() {
  const query = useQuery<AccessResult>({
    queryKey: ["polymarket-access"],
    staleTime: ONE_HOUR,
    gcTime: ONE_HOUR,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const res = await fetch("/api/polymarket/access");
      if (!res.ok) throw new Error("Could not check region");
      return (await res.json()) as AccessResult;
    },
  });

  return {
    allowed: query.data?.allowed ?? true,
    country: query.data?.country ?? null,
    loading: query.isPending,
  };
}
