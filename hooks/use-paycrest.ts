"use client";

import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { unwrap } from "@/lib/api/envelope";
import {
  isTerminalProgress,
  paycrestProgress,
  type OfframpOrderRequest,
  type OnrampOrderRequest,
  type PaycrestDirection,
  type PaycrestInstitution,
  type PaycrestOrder,
  type PaycrestQuote,
  type PaycrestToken,
} from "@/lib/paycrest/types";
import { isDecimalString } from "@/lib/paycrest/amounts";

// Client hooks over the Paycrest proxy (/api/paycrest). The proxy validates
// every Paycrest response into lib/paycrest/types shapes, so these hooks only
// unwrap the { success, data | error } envelope.

const POLL_MS = 5_000;

/** The banks and mobile wallets Paycrest pays out to for one currency. */
export function usePaycrestInstitutions(currency: string, enabled = true) {
  return useQuery<PaycrestInstitution[]>({
    queryKey: ["paycrest-institutions", currency],
    enabled,
    staleTime: 60 * 60 * 1000,
    queryFn: async () =>
      unwrap<PaycrestInstitution[]>(
        await apiFetch(`/api/paycrest/institutions/${encodeURIComponent(currency)}`),
        "Could not load the bank list"
      ),
  });
}

/**
 * Live buy and sell rates for `amount` tokens. The order fixes its own rate
 * when created, so this only drives the on-screen estimate.
 */
export function usePaycrestQuote(token: PaycrestToken, amount: string | null, fiat: string) {
  const trimmed = (amount ?? "").trim();
  const usable = isDecimalString(trimmed) && /[1-9]/.test(trimmed);
  return useQuery<PaycrestQuote>({
    queryKey: ["paycrest-quote", token, trimmed, fiat],
    enabled: usable,
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
    placeholderData: keepPreviousData,
    retry: 1,
    queryFn: async () =>
      unwrap<PaycrestQuote>(
        await apiFetch(
          `/api/paycrest/rates/${token}/${encodeURIComponent(trimmed)}/${encodeURIComponent(fiat)}`
        ),
        "Could not load the rate"
      ),
  });
}

/** Resolve the holder's name for an account; null when the corridor gives none. */
export function useVerifyPaycrestAccount() {
  return useMutation<
    { accountName: string | null },
    Error,
    { institution: string; accountIdentifier: string }
  >({
    mutationFn: async (body) =>
      unwrap(
        await apiFetch(
          "/api/paycrest/verify-account",
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          },
          { requireAuth: true }
        ),
        "Could not verify the account"
      ),
  });
}

function useCreateOrder<T>(direction: PaycrestDirection) {
  return useMutation<PaycrestOrder, Error, T>({
    mutationFn: async (body) =>
      unwrap<PaycrestOrder>(
        await apiFetch(
          `/api/paycrest/orders/${direction}`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          },
          { requireAuth: true }
        ),
        "Could not create the order"
      ),
  });
}

export const useCreatePaycrestOfframp = () => useCreateOrder<OfframpOrderRequest>("offramp");
export const useCreatePaycrestOnramp = () => useCreateOrder<OnrampOrderRequest>("onramp");

/** Poll one order until it reaches an end state. */
export function usePaycrestOrder(id: string | null, direction: PaycrestDirection) {
  return useQuery<PaycrestOrder>({
    queryKey: ["paycrest-order", id],
    enabled: Boolean(id),
    queryFn: async () =>
      unwrap<PaycrestOrder>(
        await apiFetch(
          `/api/paycrest/orders/${encodeURIComponent(id!)}`,
          {},
          { requireAuth: true }
        ),
        "Could not load the order"
      ),
    refetchInterval: (query) => {
      const order = query.state.data;
      return order && isTerminalProgress(paycrestProgress(order.status, direction))
        ? false
        : POLL_MS;
    },
  });
}

/** A fresh order reference per attempt; a retry of the same attempt reuses it. */
export function paycrestReference(direction: PaycrestDirection): string {
  return `${direction}-${crypto.randomUUID()}`;
}
