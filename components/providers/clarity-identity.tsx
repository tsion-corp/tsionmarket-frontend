"use client";

import { useEffect, useRef } from "react";
import { useQueryClient, type Query } from "@tanstack/react-query";
import { useAuthSession } from "@/hooks/use-auth-session";
import { identifyClarity, tagClaritySession, type UserTier } from "@/lib/analytics/clarity";
import type { Portfolio } from "@/hooks/use-portfolio";

const ACTIVATED_USD = 1;
const POWER_USD = 500;

function tierFor(totalUsd: number): UserTier {
  if (totalUsd >= POWER_USD) return "power";
  if (totalUsd >= ACTIVATED_USD) return "activated";
  return "new";
}

function isFullPortfolioQuery(query: Query): boolean {
  return query.queryKey[0] === "portfolio" && query.queryKey[1] !== "base";
}

function tagTier(totalUsd: number): void {
  void tagClaritySession({ user_tier: tierFor(totalUsd) });
}

/**
 * Ties Clarity recordings to the signed-in account's EVM wallet and tags them
 * with the account's tier, so a replay can be found by who and by segment.
 *
 * The tier is read from the query cache rather than through usePortfolio, so
 * mounting this above every route starts no balance poll of its own.
 */
export function ClarityIdentity(): null {
  const { ready, authenticated, evmAddress } = useAuthSession();
  const queryClient = useQueryClient();
  const identifiedAs = useRef<string | null>(null);

  useEffect(() => {
    if (!ready || !authenticated) {
      identifiedAs.current = null;
      return;
    }
    if (!evmAddress || identifiedAs.current === evmAddress) return;
    identifiedAs.current = evmAddress;
    void identifyClarity(evmAddress);
    void tagClaritySession({ user_tier: "new" });
  }, [ready, authenticated, evmAddress]);

  useEffect(() => {
    if (!ready || !authenticated) return;

    const cache = queryClient.getQueryCache();
    const known = cache
      .findAll({ queryKey: ["portfolio"] })
      .filter(isFullPortfolioQuery)
      .map((query) => query.state.data as Portfolio | undefined)
      .find((data) => data !== undefined);
    if (known) tagTier(known.totalUsd);

    return cache.subscribe((event) => {
      if (event.type !== "updated" || event.action.type !== "success") return;
      if (!isFullPortfolioQuery(event.query)) return;
      const data = event.query.state.data as Portfolio | undefined;
      if (data) tagTier(data.totalUsd);
    });
  }, [ready, authenticated, queryClient]);

  return null;
}
