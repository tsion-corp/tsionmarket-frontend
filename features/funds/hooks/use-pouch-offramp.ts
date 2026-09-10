"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import type { BankAccountInput, OfframpCreation, VerifiedBank } from "@/lib/pouch/offramp";
import { fetchPouchRate, pouchPostWithAuth } from "@/lib/api/services/funds";

// Client hooks over the offramp proxy routes. The routes return normalized
// domain objects; raw provider shapes stay behind /api/pouch. The bank list is
// a static snapshot (lib/pouch/banks.ts); settlement status is polled with the
// shared useOnrampStatus hook (same /v2/sessions endpoint).

// Pouch's live sell rate (Naira per USD) for the payout estimate.
export function useOfframpRate() {
  return useQuery<{ rate: number }>({
    queryKey: ["pouch-offramp-rate"],
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    queryFn: () => fetchPouchRate("SELL"),
  });
}

export function useVerifyBank() {
  return useMutation<VerifiedBank, Error, { accountNumber: string; networkId: string }>({
    mutationFn: ({ accountNumber, networkId }) =>
      pouchPostWithAuth<VerifiedBank>("/verify-bank", { accountNumber, networkId }),
  });
}

export interface CreateOfframpInput {
  token: string;
  cryptoAmount: number;
  bankAccount: BankAccountInput;
}

export function useCreateOfframp() {
  return useMutation<OfframpCreation, Error, CreateOfframpInput>({
    mutationFn: ({ token, cryptoAmount, bankAccount }) =>
      pouchPostWithAuth<OfframpCreation>("/offramp", { cryptoAmount, bankAccount }, token),
  });
}
