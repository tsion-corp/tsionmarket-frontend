"use client";

import { useQuery } from "@tanstack/react-query";
import type { LegacyAddresses, LegacySigner, VenueAdapter } from "@/lib/migration/types";
import { discoverHoldings, type DiscoveryResult } from "@/features/migrate/lib/discover";

// Every ["migration", ...] query is removed when the sheet closes, so
// old-identity data never lingers next to the dashboard's own queries.
export const MIGRATION_QUERY_PREFIX = ["migration"] as const;

export function legacyHoldingsKey(legacy: LegacyAddresses, hasLegacySession: boolean) {
  return [
    ...MIGRATION_QUERY_PREFIX,
    "holdings",
    legacy.evm,
    legacy.solana,
    hasLegacySession,
  ] as const;
}

export interface LegacyHoldingsInput {
  adapters: readonly VenueAdapter[];
  legacy: LegacyAddresses;
  current: LegacyAddresses;
  // Null until the user has signed in to the old account.
  signer: LegacySigner | null;
  ethPriceUsd: number;
}

// What the old wallet still holds across every venue. Re-runs when the old
// sign-in lands, since the ledgers keyed by that identity only open then.
export function useLegacyHoldings(input: LegacyHoldingsInput) {
  const hasLegacySession = input.signer !== null;
  return useQuery<DiscoveryResult>({
    queryKey: legacyHoldingsKey(input.legacy, hasLegacySession),
    enabled: input.legacy.evm !== null || input.legacy.solana !== null,
    // Balances move under this query's feet during a run; nothing is fresh
    // for longer than the screen showing it.
    staleTime: 0,
    gcTime: 60_000,
    queryFn: () =>
      discoverHoldings(input.adapters, {
        legacy: input.legacy,
        current: input.current,
        hasLegacySession,
        signer: input.signer,
        ethPriceUsd: input.ethPriceUsd,
      }),
  });
}
