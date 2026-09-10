"use client";

import { useQuery } from "@tanstack/react-query";

interface TokenRef {
  chain: string;
  address: string;
}

const ONE_HOUR = 60 * 60 * 1000;

const EMPTY_LOGOS: Record<string, string> = {};

// Composite key the batch route and callers both derive independently, so a
// resolved logo lines up with its token regardless of the asset's own id format.
export function tokenLogoKey(chain: string, address: string): string {
  return `${chain}:${address}`;
}

// Resolves real logos for a set of tokens in one batched request. Returns a map
// keyed by `${chain}:${address}`. Missing entries fall back to whatever the
// caller passes to AssetIcon.
export function useTokenLogos(tokens: TokenRef[]): Record<string, string> {
  const key = tokens.map((t) => tokenLogoKey(t.chain, t.address)).sort();
  const { data } = useQuery<Record<string, string>>({
    queryKey: ["token-logos", key],
    enabled: tokens.length > 0,
    staleTime: ONE_HOUR,
    gcTime: ONE_HOUR,
    queryFn: async () => {
      const res = await fetch("/api/token-logos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tokens: tokens.map((t) => ({ chain: t.chain, address: t.address })),
        }),
      });
      if (!res.ok) throw new Error("Logo request failed");
      const body = await res.json();
      return body.logos ?? {};
    },
  });
  return data ?? EMPTY_LOGOS;
}
