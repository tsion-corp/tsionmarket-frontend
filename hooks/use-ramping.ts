"use client";

import { useEffect, useSyncExternalStore } from "react";
import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { SETTLE_CHAINS } from "@/lib/deposit";
import {
  isTerminalProgress,
  normalizeBanks,
  normalizeOfframpOrder,
  normalizeOnrampOrder,
  normalizeRates,
  type OfframpOrder,
  type OnrampOrder,
  type RampBank,
  type RampingRates,
} from "@/lib/ramping/orders";
import {
  clearPendingBankDeposit,
  isPendingBankDepositActive,
  PENDING_DEPOSIT_TTL_MS,
  pendingBankDepositSnapshot,
  serverPendingBankDepositSnapshot,
  subscribePendingBankDeposit,
} from "@/lib/ramping/pending";

// Client hooks over the ramping proxy (/api/ramping). The proxy verifies the
// session and forwards to the rail; these hooks normalize the raw shapes into
// lib/ramping/orders domain objects, so raw rail JSON never reaches a screen.

async function readError(res: Response, fallback: string): Promise<never> {
  let message = fallback;
  try {
    const body = await res.json();
    const detail = body?.error?.message ?? body?.error;
    if (typeof detail === "string" && detail) message = detail;
  } catch {
    // Non-JSON error body; keep the fallback.
  }
  throw new Error(message);
}

async function readData(res: Response, fallback: string): Promise<unknown> {
  if (!res.ok) await readError(res, fallback);
  const body = (await res.json()) as { data?: unknown };
  return body?.data ?? body;
}

// The live NGN per USDC rates, both directions in one call. A fresh order
// locks its own rate at creation, so a minute of staleness here only moves the
// on-screen estimate, never the money.
export function useRampingRates() {
  return useQuery<RampingRates>({
    queryKey: ["ramping-rates"],
    staleTime: 60 * 1000,
    refetchInterval: 60 * 1000,
    queryFn: async () => {
      const res = await apiFetch("/api/ramping/rates", {}, { requireAuth: true });
      return normalizeRates(await readData(res, "Could not load the rate"));
    },
    retry: 2,
  });
}

// The full Nigerian bank list, fetched once and filtered client-side. It
// changes rarely; the proxy caches it for ten minutes on top of this hour.
export function useRampingBanks(enabled: boolean) {
  return useQuery<RampBank[]>({
    queryKey: ["ramping-banks"],
    enabled,
    staleTime: 60 * 60 * 1000,
    queryFn: async () => {
      const res = await apiFetch("/api/ramping/banks", {}, { requireAuth: true });
      return normalizeBanks(await readData(res, "Could not load the bank list"));
    },
  });
}

export interface ResolvedBankAccount {
  accountName: string;
}

// Confirm an account number belongs to a real account at the chosen bank.
// The rail returns a bare 500 for a bank it cannot resolve against, so every
// failure reads as "couldn't verify", never as a server fault.
export function useResolveBankAccount() {
  return useMutation<ResolvedBankAccount, Error, { accountNumber: string; bankUuid: string }>({
    mutationFn: async ({ accountNumber, bankUuid }) => {
      const res = await apiFetch(
        "/api/ramping/banks/resolve",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accountNumber, bankUuid }),
        },
        { requireAuth: true }
      );
      if (!res.ok) throw new Error("We couldn't verify that account");
      const data = (await readData(res, "We couldn't verify that account")) as Record<
        string,
        unknown
      >;
      const accountName = typeof data?.account_name === "string" ? data.account_name.trim() : "";
      if (!accountName) throw new Error("We couldn't verify that account");
      return { accountName };
    },
  });
}

export interface CreateOnrampInput {
  // Where the bought USDC lands: the user's own EVM wallet.
  destinationAddress: string;
  // What the user said they will send, advisory only. Decimal string, NGN.
  expectedAmountNgn: string;
  // Caller-generated x-idempotency-key. One per attempt; a retry of the same
  // attempt reuses it verbatim and replays the same order.
  idempotencyKey: string;
}

export function useCreateOnrampOrder() {
  return useMutation<OnrampOrder, Error, CreateOnrampInput>({
    mutationFn: async ({ destinationAddress, expectedAmountNgn, idempotencyKey }) => {
      const res = await apiFetch(
        "/api/ramping/onramps",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-idempotency-key": idempotencyKey,
          },
          // Pin the settlement to base-mainnet native USDC, the same asset and
          // chain the crypto deposit rail uses. Without this the Difference rail
          // picks its own default chain, and USDC that lands off-Base is money
          // the user still sees (Cash aggregates every chain) but the referral
          // deposit probe - which watches base-mainnet only - never sees, so a
          // referred user's bank deposit never qualifies their referrer.
          body: JSON.stringify({
            destinationAddress,
            destinationChainId: SETTLE_CHAINS.base.chainId,
            destinationAsset: SETTLE_CHAINS.base.usdc,
            expectedAmountNgn,
          }),
        },
        { requireAuth: true }
      );
      const order = normalizeOnrampOrder(await readData(res, "We couldn't set up the transfer"));
      if (!order.id) throw new Error("We couldn't set up the transfer");
      return order;
    },
  });
}

export interface CreateOfframpInput {
  // The chain and asset the user sends from: Base USDC.
  originChainId: number;
  originAsset: string;
  // Decimal string, USDC, what the user is selling.
  expectedAmount: string;
  destinationAccount: string;
  destinationBankUuid: string;
  idempotencyKey: string;
}

export function useCreateOfframpOrder() {
  return useMutation<OfframpOrder, Error, CreateOfframpInput>({
    mutationFn: async ({ idempotencyKey, ...body }) => {
      const res = await apiFetch(
        "/api/ramping/offramps",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-idempotency-key": idempotencyKey,
          },
          body: JSON.stringify(body),
        },
        { requireAuth: true }
      );
      const order = normalizeOfframpOrder(await readData(res, "We couldn't set up the payout"));
      if (!order.id) throw new Error("We couldn't set up the payout");
      return order;
    },
  });
}

// Poll one order until the rail will not move it again. The status is read
// live from the rail, so a paid transfer usually flips within one poll. An
// expired onramp stops the poll too: its account still pays at the live rate,
// but the order itself stays expired, so there is nothing left to learn.
export function useRampOrder(
  kind: "onramp" | "offramp",
  orderId: string | null,
  options: { enabled: boolean; pollMs?: number } = { enabled: true }
) {
  const pollMs = options.pollMs ?? 3000;
  return useQuery<OnrampOrder | OfframpOrder>({
    queryKey: ["ramping-order", kind, orderId],
    enabled: options.enabled && Boolean(orderId),
    // Keep the last good order visible while a poll is in flight or briefly
    // failing, so the account/status view never blanks mid-cycle.
    placeholderData: keepPreviousData,
    // A transient poll failure is retried a few times rather than surfaced
    // immediately as isError, which the screen would otherwise react to.
    retry: 3,
    refetchInterval: (query) => {
      const current = query.state.data?.status;
      if (current && isTerminalProgress(current)) return false;
      return pollMs;
    },
    queryFn: async () => {
      const path = kind === "onramp" ? "onramps" : "offramps";
      const res = await apiFetch(
        `/api/ramping/${path}/${encodeURIComponent(orderId!)}`,
        {},
        { requireAuth: true }
      );
      const data = await readData(res, "Could not check the transfer");
      return kind === "onramp" ? normalizeOnrampOrder(data) : normalizeOfframpOrder(data);
    },
  });
}

// The confirmed bank transfer still settling, if any. The balance card uses it
// to hold the withdraw button and explain the wait. Polls settlement and drops
// the stored order once it lands, fails, or the hold times out.
export function usePendingBankDeposit(): { pending: boolean } {
  const stored = useSyncExternalStore(
    subscribePendingBankDeposit,
    pendingBankDepositSnapshot,
    serverPendingBankDepositSnapshot
  );

  // The TTL is enforced against the store, not React state: when the hold
  // lapses the stored order is dropped, the store notifies, and the button
  // frees. This keeps render pure and the effect free of setState.
  useEffect(() => {
    if (!stored) return;
    if (!isPendingBankDepositActive(stored, Date.now())) {
      clearPendingBankDeposit();
      return;
    }
    const remaining = stored.confirmedAt + PENDING_DEPOSIT_TTL_MS - Date.now();
    const id = setTimeout(clearPendingBankDeposit, remaining + 250);
    return () => clearTimeout(id);
  }, [stored]);

  const statusQuery = useRampOrder("onramp", stored?.orderId ?? null, {
    enabled: stored != null,
    pollMs: 20000,
  });
  const status = statusQuery.data?.status ?? null;
  const terminal = status != null && isTerminalProgress(status);

  // Drop the stored order once settlement resolves.
  useEffect(() => {
    if (stored && terminal) clearPendingBankDeposit();
  }, [stored, terminal]);

  return { pending: stored != null && !terminal };
}
