"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import {
  isTerminalOnrampStatus,
  type OnrampCreation,
  type OnrampStatusResult,
} from "@/lib/pouch/onramp";

// Client hooks over the onramp proxy routes. The routes already return normalized
// domain objects, so these hooks only type the response and surface errors.

async function readError(res: Response, fallback: string): Promise<never> {
  let message = fallback;
  try {
    const body = await res.json();
    if (body && typeof body.error === "string") message = body.error;
  } catch {
    // Non-JSON error body; keep the fallback.
  }
  throw new Error(message);
}

export interface CreateOnrampInput {
  // The Shared KYC JWT that authorizes the onramp without re-collecting identity.
  token: string;
  amountUsd: number;
  walletAddress: string;
}

export function useCreateOnramp() {
  return useMutation<OnrampCreation, Error, CreateOnrampInput>({
    mutationFn: async ({ token, amountUsd, walletAddress }) => {
      const res = await fetch("/api/pouch/onramp", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ amountUsd, walletAddress }),
      });
      if (!res.ok) await readError(res, "We couldn't set up the transfer");
      return res.json();
    },
  });
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
    queryFn: async () => {
      const res = await fetch(
        `/api/pouch/onramp/status?sessionId=${encodeURIComponent(sessionId!)}`
      );
      if (!res.ok) await readError(res, "Could not check the transfer");
      return res.json();
    },
  });
}
