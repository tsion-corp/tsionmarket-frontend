"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import type { BankAccountInput, OfframpCreation, VerifiedBank } from "@/lib/pouch/offramp";
import { apiFetch } from "@/lib/api";

// Client hooks over the offramp proxy routes. The routes return normalized
// domain objects; raw provider shapes stay behind /api/pouch. The bank list is
// a static snapshot (lib/pouch/banks.ts); settlement status is polled with the
// shared useOnrampStatus hook (same /v2/sessions endpoint).

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

// Pouch's live sell rate (Naira per USD) for the payout estimate.
export function useOfframpRate() {
  return useQuery<{ rate: number }>({
    queryKey: ["pouch-offramp-rate"],
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    queryFn: async () => {
      const res = await apiFetch("/api/pouch/rate?type=SELL");
      if (!res.ok) await readError(res, "Could not load the rate");
      return res.json();
    },
  });
}

export function useVerifyBank() {
  return useMutation<VerifiedBank, Error, { accountNumber: string; networkId: string }>({
    mutationFn: async ({ accountNumber, networkId }) => {
      const res = await fetch("/api/pouch/verify-bank", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountNumber, networkId }),
      });
      if (!res.ok) await readError(res, "We couldn't verify that account");
      return res.json();
    },
  });
}

export interface CreateOfframpInput {
  token: string;
  cryptoAmount: number;
  bankAccount: BankAccountInput;
}

export function useCreateOfframp() {
  return useMutation<OfframpCreation, Error, CreateOfframpInput>({
    mutationFn: async ({ token, cryptoAmount, bankAccount }) => {
      const res = await fetch("/api/pouch/offramp", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ cryptoAmount, bankAccount }),
      });
      if (!res.ok) await readError(res, "We couldn't set up the withdrawal");
      return res.json();
    },
  });
}
