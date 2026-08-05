"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import {
  isTerminalRampStatus,
  unwrapEnvelope,
  type Corridor,
  type CreateOfframpInput,
  type OfframpQuote,
  type OfframpQuoteInput,
  type PayoutBank,
  type RampOrder,
  type VerifyRecipientInput,
  type VerifyRecipientResult,
} from "@/lib/payment/offramp";
import { OFFRAMP_ORIGIN } from "@/lib/payment/offramp";

const QUOTE_DEBOUNCE_MS = 500;
const ORDER_POLL_MS = 5_000;

async function paymentGet<T>(path: string, fallback: string): Promise<T> {
  const res = await apiFetch(`/api/payment/${path}`, {}, { requireAuth: true });
  const body = await res.json().catch(() => null);
  return unwrapEnvelope<T>(body, fallback);
}

async function paymentPost<T>(path: string, payload: unknown, fallback: string): Promise<T> {
  const res = await apiFetch(
    `/api/payment/${path}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
    { requireAuth: true }
  );
  const body = await res.json().catch(() => null);
  return unwrapEnvelope<T>(body, fallback);
}

// The countries the rail can pay out to right now. Effectively static within a
// session; failures degrade the flow to "no corridors" rather than a crash.
export function useCorridors() {
  return useQuery<Corridor[]>({
    queryKey: ["offramp", "corridors"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const data = await paymentGet<{ corridors: Corridor[] }>(
        "corridors",
        "Couldn't load destinations"
      );
      return data.corridors;
    },
  });
}

// Payout banks / networks for a corridor country (ISO alpha-2, any case).
export function usePayoutBanks(country: string | null) {
  return useQuery<PayoutBank[]>({
    queryKey: ["offramp", "banks", country?.toUpperCase() ?? null],
    enabled: !!country,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const data = await paymentGet<{ banks: PayoutBank[] }>(
        `corridors/${(country as string).toUpperCase()}/banks`,
        "Couldn't load banks"
      );
      return data.banks;
    },
  });
}

// A live composed quote (fiat leg + crypto reverse-quote), debounced so typing
// an amount doesn't hammer both rails on every keystroke. Never retried: the
// rail's own SERVICE_UNAVAILABLE must surface, not spin.
export function useOfframpQuote(input: OfframpQuoteInput | null) {
  const [debounced, setDebounced] = useState(input);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(input), QUOTE_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [input]);

  return useQuery<OfframpQuote>({
    queryKey: ["offramp", "quote", debounced],
    enabled: debounced !== null,
    staleTime: 30_000,
    retry: false,
    refetchOnWindowFocus: false,
    queryFn: () =>
      paymentPost<OfframpQuote>(
        "offramp/quote",
        {
          recipient: {
            toCountry: (debounced as OfframpQuoteInput).toCountry,
            receiveCurrency: (debounced as OfframpQuoteInput).receiveCurrency,
            receiveAmount: (debounced as OfframpQuoteInput).receiveAmount,
          },
          originChainId: OFFRAMP_ORIGIN.chainId,
          originAsset: OFFRAMP_ORIGIN.asset,
        },
        "Couldn't get a quote"
      ),
  });
}

// Name enquiry against the fiat rail before an order exists: resolves a
// payout account to its holder so a wrong account or bank is caught up-front,
// not after the crypto has moved.
export function useVerifyRecipient() {
  return useMutation<VerifyRecipientResult, Error, VerifyRecipientInput>({
    mutationFn: (input) =>
      paymentPost<VerifyRecipientResult>(
        "offramp/verify-recipient",
        input,
        "Couldn't verify the account"
      ),
  });
}

// Creates the order and returns it with its deposit address. The caller then
// sends the quoted USDC there and polls the order.
export function useCreateOfframp() {
  return useMutation<RampOrder, Error, CreateOfframpInput>({
    mutationFn: (input) =>
      paymentPost<RampOrder>(
        "offramp/orders",
        {
          ...input,
          originChainId: OFFRAMP_ORIGIN.chainId,
          originAsset: OFFRAMP_ORIGIN.asset,
        },
        "Couldn't create the payout"
      ),
  });
}

// Polls an order until the payout resolves. The GET itself advances the payout
// leg server-side, so polling is also what nudges a stalled order forward.
export function useRampOrder(orderId: string | null) {
  return useQuery<RampOrder>({
    queryKey: ["offramp", "order", orderId],
    enabled: !!orderId,
    refetchInterval: (query) => {
      const status = query.state.data?.publicStatus;
      return status && isTerminalRampStatus(status) ? false : ORDER_POLL_MS;
    },
    queryFn: () => paymentGet<RampOrder>(`offramp/orders/${orderId}`, "Couldn't check the payout"),
  });
}
