"use client";
import { useAuthSession } from "@/hooks/use-auth-session";

import { useMemo } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import {
  fetchLegacyActivity,
  fetchUserActivity,
  type UserActivity,
} from "@/lib/api/services/activity";

import { buildActivityEntries, type ActivityEntry } from "@/lib/activity/entries";
import type { ActivityItem } from "@/lib/server/activity";

export type { ActivityItem } from "@/lib/server/activity";
export type { ActivityEntry, ActivityKind } from "@/lib/activity/entries";

// History changes only when a transaction lands, so a slow poll is plenty;
// anything that needs to see its own effect immediately calls refetch().
//
// One sweep is the most expensive read in the app: an upstream call per
// network per direction. So the rate depends on who is asking.
//
// The activity screen is being looked at, so it stays close: two minutes.
const POLL_MS = 2 * 60_000;
// The notification bell is in the topbar on EVERY screen, so its poll is the
// one that multiplies across the whole signed-in population. It is a nudge
// that something happened, not a live feed, and ten minutes is well inside
// what anyone notices. React Query drives a shared key at its shortest
// observer interval, so opening the activity screen still pulls it back to
// two minutes for as long as that screen is mounted.
export const BELL_POLL_MS = 10 * 60_000;
const EMPTY: ActivityItem[] = [];
const EMPTY_ENTRIES: ActivityEntry[] = [];

export function useActivity({ pollMs = POLL_MS }: { pollMs?: number } = {}) {
  const { ready, authenticated, evmAddress, solanaAddress, profile } = useAuthSession();
  const addressFor = (chain: string) => (chain === "solana" ? solanaAddress : evmAddress);
  const evm = evmAddress;
  const solana = solanaAddress;
  const enabled = ready && authenticated && Boolean(evm || solana);

  const query = useQuery<UserActivity>({
    queryKey: queryKeys.activity.byWallet(evm, solana),
    enabled,
    queryFn: () => fetchUserActivity({ evm, solana }),
    refetchInterval: pollMs,
    staleTime: POLL_MS,
    // Keep the current list rendered while a poll refetches, so the feed never
    // drops back to a loading state or flashes empty between ticks.
    placeholderData: keepPreviousData,
    retry: (count, error) =>
      !(error instanceof Error && error.message.toLowerCase().includes("too many")) && count < 2,
  });

  // The OLD account's history, kept from a snapshot at the upgrade rather
  // than swept from the chain: static once the sweep is done, so read once and
  // held for the session. Null for an account that never had one.
  const legacy = useQuery({
    queryKey: [...queryKeys.activity.all, "legacy", evm ?? null],
    enabled: ready && authenticated && Boolean(evm),
    queryFn: fetchLegacyActivity,
    staleTime: Infinity,
    retry: false,
  });
  const legacyItems = legacy.data?.items ?? EMPTY;
  // Consumers want actions, not transfers: a purchase is one event even though
  // it moved two assets. Live and old are one timeline; the builder groups by
  // chain and hash, so a transfer both wallets saw is one row, not two.
  const raw = query.data?.items ?? EMPTY;
  const items = useMemo(() => {
    if (raw.length === 0 && legacyItems.length === 0) return EMPTY_ENTRIES;
    return buildActivityEntries([...raw, ...legacyItems]);
  }, [raw, legacyItems]);

  return {
    items,
    loading: query.isLoading,
    error: query.isError,
    // Some source did not answer, so `items` is not the whole history. The
    // view says so rather than presenting a short list as a complete one.
    partial: (query.data?.unavailable?.length ?? 0) > 0,
    refetch: query.refetch,
  };
}
