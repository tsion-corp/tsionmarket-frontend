"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { usePrivy } from "@privy-io/react-auth";
import { getWalletAddress } from "@/lib/user";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import {
  getKashAccount,
  getKashConversionQuote,
  getKashLedger,
  getKashPurchaseQuote,
  getKashStatus,
  getKashSubscription,
  getKashSubscriptionTiers,
  isValidKashAmount,
  postKashConversion,
  postKashPurchase,
  postKashSubscribe,
} from "@/features/portfolio/lib/kash";

// Engine parameters move rarely (price at most 25% a day, everything else by
// config change), so a minute of staleness is invisible and keeps the shared
// status read off the hot path.
const STATUS_STALE_MS = 60 * 1000;

// The account payload changes when the user acts (buy, convert) and when a
// vesting tranche unlocks. Actions invalidate explicitly; the interval only
// has to catch tranches, so a slow poll is plenty.
const ACCOUNT_POLL_MS = 60 * 1000;

export function useKashStatus() {
  return useQuery({
    queryKey: ["kash", "status"],
    queryFn: getKashStatus,
    staleTime: STATUS_STALE_MS,
  });
}

// The caller's Kash account, keyed on their embedded EVM wallet. Disabled until
// the wallet exists, so signed-out visitors never fire an authed call.
export function useKashAccount() {
  const { user, ready, authenticated } = usePrivy();
  const wallet = getWalletAddress(user, "ethereum");

  const query = useQuery({
    queryKey: ["kash", "account", wallet],
    queryFn: () => getKashAccount(wallet as string),
    enabled: ready && authenticated && Boolean(wallet),
    refetchInterval: ACCOUNT_POLL_MS,
  });

  return { ...query, wallet };
}

// The tier catalogue is engine config; it moves on deploys, not minutes.
export function useKashSubscriptionTiers(enabled: boolean) {
  return useQuery({
    queryKey: ["kash", "subscription-tiers"],
    queryFn: getKashSubscriptionTiers,
    staleTime: STATUS_STALE_MS,
    enabled,
  });
}

// The caller's subscription tier. Drives the tier chip on the card, so it
// loads with the account rather than waiting for the upgrade sheet to open.
export function useKashSubscription() {
  const { user, ready, authenticated } = usePrivy();
  const wallet = getWalletAddress(user, "ethereum");

  return useQuery({
    queryKey: ["kash", "subscription", wallet],
    queryFn: () => getKashSubscription(wallet as string),
    enabled: ready && authenticated && Boolean(wallet),
    staleTime: STATUS_STALE_MS,
  });
}

// The caller's recent Kash ledger, fetched only while the history view is
// open. Mutations invalidate the whole ["kash"] tree, so a fresh purchase or
// conversion appears without extra wiring.
export function useKashLedger(enabled: boolean) {
  const { user, ready, authenticated } = usePrivy();
  const wallet = getWalletAddress(user, "ethereum");

  return useQuery({
    queryKey: ["kash", "ledger", wallet],
    queryFn: () => getKashLedger(wallet as string),
    enabled: enabled && ready && authenticated && Boolean(wallet),
  });
}

// Quote for a buy amount, debounced so typing does not fire a request per
// keystroke. An invalid amount disables the query instead of sending it.
export function useKashPurchaseQuote(usdcAmount: string) {
  const debounced = useDebouncedValue(usdcAmount.trim(), 300);
  return useQuery({
    queryKey: ["kash", "purchase-quote", debounced],
    queryFn: () => getKashPurchaseQuote(debounced),
    enabled: isValidKashAmount(debounced),
  });
}

export function useKashConversionQuote(kashAmount: string) {
  const debounced = useDebouncedValue(kashAmount.trim(), 300);
  return useQuery({
    queryKey: ["kash", "conversion-quote", debounced],
    queryFn: () => getKashConversionQuote(debounced),
    enabled: isValidKashAmount(debounced),
  });
}

// Both mutations settle the account balance server-side, so success refreshes
// every kash read at once rather than patching caches by hand.
function useInvalidateKash() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["kash"] });
}

export function useKashPurchase() {
  const invalidate = useInvalidateKash();
  return useMutation({
    mutationFn: ({
      wallet,
      usdcAmount,
      paymentTxHash,
    }: {
      wallet: string;
      usdcAmount: string;
      paymentTxHash?: string;
    }) => postKashPurchase(wallet, usdcAmount, paymentTxHash),
    onSuccess: invalidate,
  });
}

export function useKashSubscribe() {
  const invalidate = useInvalidateKash();
  return useMutation({
    mutationFn: ({
      wallet,
      tier,
      paymentTxHash,
    }: {
      wallet: string;
      tier: number;
      paymentTxHash?: string;
    }) => postKashSubscribe(wallet, tier, paymentTxHash),
    onSuccess: invalidate,
  });
}

export function useKashConversion() {
  const invalidate = useInvalidateKash();
  return useMutation({
    mutationFn: ({
      wallet,
      kashAmount,
      permit,
    }: {
      wallet: string;
      kashAmount: string;
      permit?: { deadline: number; v: number; r: string; s: string };
    }) => postKashConversion(wallet, kashAmount, permit),
    onSuccess: invalidate,
  });
}
