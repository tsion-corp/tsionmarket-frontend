"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  isTerminalOnrampStatus,
  type OnrampCreation,
  type OnrampStatusResult,
} from "@/lib/pouch/onramp";
import {
  clearPendingOnramp,
  isPendingOnrampActive,
  PENDING_ONRAMP_TTL_MS,
  pendingOnrampSnapshot,
  serverPendingOnrampSnapshot,
  subscribePendingOnramp,
} from "@/lib/pouch/pending";
import { fetchPouchRate, pouchPostWithAuth, pouchGetWithAuth } from "@/lib/api/services/funds";

// Client hooks over the onramp proxy routes. The routes already return normalized
// domain objects, so these hooks only type the response and surface errors.

// Pouch's live onramp rate (Naira per USD). Cached for a few minutes; the entry
// screen divides the typed Naira by it to show a USD estimate that matches the
// charge.
export function usePouchOnrampRate() {
  return useQuery<{ rate: number }>({
    queryKey: ["pouch-onramp-rate"],
    queryFn: () => fetchPouchRate(),
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });
}

export interface CreateOnrampInput {
  // The Shared KYC JWT that authorizes the onramp without re-collecting identity.
  token: string;
  amountUsd: number;
  walletAddress: string;
}

export function useCreateOnramp() {
  return useMutation<OnrampCreation, Error, CreateOnrampInput>({
    mutationFn: ({ token, amountUsd, walletAddress }) =>
      pouchPostWithAuth<OnrampCreation>("/onramp", { amountUsd, walletAddress }, token),
  });
}

// The confirmed bank transfer still settling, if any. The balance card uses it
// to hold the withdraw button and explain the wait. Polls settlement and drops
// the stored session once it lands, fails, or the hold times out.
export function usePendingOnramp(): { pending: boolean } {
  const stored = useSyncExternalStore(
    subscribePendingOnramp,
    pendingOnrampSnapshot,
    serverPendingOnrampSnapshot
  );

  // The TTL is enforced against the store, not React state: when the hold
  // lapses the stored session is dropped, the store notifies, and the button
  // frees. This keeps render pure and the effect free of setState.
  useEffect(() => {
    if (!stored) return;
    if (!isPendingOnrampActive(stored, Date.now())) {
      clearPendingOnramp();
      return;
    }
    const remaining = stored.confirmedAt + PENDING_ONRAMP_TTL_MS - Date.now();
    const id = setTimeout(clearPendingOnramp, remaining + 250);
    return () => clearTimeout(id);
  }, [stored]);

  const statusQuery = useOnrampStatus(stored?.sessionId ?? null, {
    enabled: stored != null,
    pollMs: 20000,
  });
  const status = statusQuery.data?.status ?? null;
  const terminal = status != null && isTerminalOnrampStatus(status);

  // Drop the stored session once settlement resolves.
  useEffect(() => {
    if (stored && terminal) clearPendingOnramp();
  }, [stored, terminal]);

  return { pending: stored != null && !terminal };
}

// Poll a created onramp for settlement. `pollMs` drives the refetch interval;
// pass 0 to stop once the status is terminal.
export function useOnrampStatus(
  sessionId: string | null,
  options: { enabled: boolean; pollMs: number }
) {
  return useQuery<OnrampStatusResult>({
    queryKey: ["pouch-onramp-status", sessionId],
    enabled: options.enabled && Boolean(sessionId),
    // Stop polling the moment settlement reaches a terminal state.
    refetchInterval: (query) => {
      const current = query.state.data?.status;
      if (current && isTerminalOnrampStatus(current)) return false;
      return options.pollMs > 0 ? options.pollMs : false;
    },
    queryFn: () =>
      pouchGetWithAuth<OnrampStatusResult>("/onramp/status", {
        sessionId: sessionId!,
      }),
  });
}
