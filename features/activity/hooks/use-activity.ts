"use client";

import { useMemo } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { usePrivy } from "@privy-io/react-auth";
import { apiFetch } from "@/lib/api";
import { getWalletAddress } from "@/lib/user";
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
// The activity screen is being looked at, so it stays on a minute.
const POLL_MS = 60_000;
// The notification bell is in the topbar on EVERY screen, so its poll is the
// one that multiplies across the whole signed-in population. It is a nudge
// that something happened, not a live feed, and five minutes is well inside
// what anyone notices. React Query drives a shared key at its shortest
// observer interval, so opening the activity screen still pulls it back to a
// minute for as long as that screen is mounted.
export const BELL_POLL_MS = 5 * 60_000;
const EMPTY: ActivityItem[] = [];
const EMPTY_ENTRIES: ActivityEntry[] = [];

export function useActivity({ pollMs = POLL_MS }: { pollMs?: number } = {}) {
  const { user, ready, authenticated } = usePrivy();
  const evm = getWalletAddress(user, "ethereum");
  const solana = getWalletAddress(user, "solana");
  const enabled = ready && authenticated && Boolean(evm || solana);

  const query = useQuery<{ items: ActivityItem[] }>({
    queryKey: ["activity", evm, solana],
    enabled,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (evm) params.set("evm", evm);
      if (solana) params.set("solana", solana);
      const res = await apiFetch(`/api/activity?${params.toString()}`, {}, { requireAuth: true });
      if (!res.ok) {
        throw new Error(
          res.status === 429 ? "Too many requests, try again shortly" : "Could not load activity"
        );
      }
      return res.json();
    },
    refetchInterval: pollMs,
    staleTime: POLL_MS,
    // Keep the current list rendered while a poll refetches, so the feed never
    // drops back to a loading state or flashes empty between ticks.
    placeholderData: keepPreviousData,
    retry: (count, error) =>
      !(error instanceof Error && error.message.toLowerCase().includes("too many")) && count < 2,
  });

  // Consumers want actions, not transfers: a purchase is one event even though
  // it moved two assets.
  const raw = query.data?.items ?? EMPTY;
  const items = useMemo(
    () => (raw.length === 0 ? EMPTY_ENTRIES : buildActivityEntries(raw)),
    [raw]
  );

  return {
    items,
    loading: query.isLoading,
    error: query.isError,
    refetch: query.refetch,
  };
}
