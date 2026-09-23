"use client";

import { useCallback, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePrivy } from "@privy-io/react-auth";
import { getWalletAddress } from "@/lib/user";
import { errorStatus } from "@/lib/api/envelope";
import {
  EMPTY_NETWORK,
  getMyDownline,
  getMyReferralNetwork,
  type NetworkPage,
  type NetworkPerson,
  type ReferralNetwork,
} from "@/features/referrals/lib/referrals";

// The network only changes when somebody new joins through a link, which is
// not something a reader needs to the second.
const STALE_MS = 60 * 1000;

/**
 * The caller's own network.
 *
 * `/referrals/me/network` is newer than this page. Until every environment
 * serves it, a 404 has to read as "no network yet" rather than an error: the
 * page is useful without the tree, and a red banner over a feature the backend
 * has simply not deployed is worse than an empty one.
 */
export function useReferralNetwork(enabled: boolean) {
  const { user, ready, authenticated } = usePrivy();
  const wallet = getWalletAddress(user, "ethereum");

  const query = useQuery<ReferralNetwork>({
    queryKey: ["referrals", "network", wallet],
    queryFn: async () => {
      try {
        return await getMyReferralNetwork();
      } catch (error) {
        if (isMissingRoute(error)) return EMPTY_NETWORK;
        throw error;
      }
    },
    enabled: enabled && ready && authenticated && Boolean(wallet),
    staleTime: STALE_MS,
    refetchOnWindowFocus: false,
  });

  return {
    network: query.data ?? null,
    loading: query.isPending && enabled,
    error: query.isError,
    refetch: () => void query.refetch(),
  };
}

/** A generation the reader has opened, and everything loaded for it so far. */
export interface OpenGeneration {
  people: NetworkPerson[];
  nextCursor: string | null;
  loading: boolean;
}

/**
 * The generations a reader has opened.
 *
 * Each is fetched the first time it is expanded and kept afterwards, so
 * collapsing and reopening a generation costs nothing. Paging appends, because
 * the reader is walking one list rather than flipping between pages.
 */
export function useDownlineBranches() {
  const client = useQueryClient();
  const [open, setOpen] = useState<Record<number, OpenGeneration>>({});

  const load = useCallback(
    async (generation: number, cursor: string | null) => {
      setOpen((current) => ({
        ...current,
        [generation]: {
          people: current[generation]?.people ?? [],
          nextCursor: current[generation]?.nextCursor ?? null,
          loading: true,
        },
      }));
      try {
        const page = await client.fetchQuery<NetworkPage>({
          queryKey: ["referrals", "downline", generation, cursor],
          queryFn: () => getMyDownline(generation, cursor),
          staleTime: STALE_MS,
        });
        setOpen((current) => ({
          ...current,
          [generation]: {
            // Appended, not replaced: paging walks one list.
            people: [...(cursor ? (current[generation]?.people ?? []) : []), ...page.people],
            nextCursor: page.nextCursor,
            loading: false,
          },
        }));
      } catch {
        // A branch that will not load leaves the rest of the page alone.
        setOpen((current) => ({
          ...current,
          [generation]: {
            people: current[generation]?.people ?? [],
            nextCursor: current[generation]?.nextCursor ?? null,
            loading: false,
          },
        }));
      }
    },
    [client]
  );

  const toggle = useCallback(
    (generation: number) => {
      if (open[generation]) {
        setOpen(({ [generation]: _closed, ...rest }) => rest);
        return;
      }
      void load(generation, null);
    },
    [open, load]
  );

  const more = useCallback(
    (generation: number) => {
      const cursor = open[generation]?.nextCursor ?? null;
      if (cursor) void load(generation, cursor);
    },
    [open, load]
  );

  return { open, toggle, more };
}

/** A 404 from the engine: the route is not deployed in this environment yet. */
function isMissingRoute(error: unknown): boolean {
  return errorStatus(error) === 404;
}
