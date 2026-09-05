"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { usePrivy, useSignMessage } from "@privy-io/react-auth";
import { getWalletAddress } from "@/lib/user";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { markKashSyncing } from "@/features/portfolio/hooks/use-kash-sync";
import {
  claimSettlementMessage,
  getKashAccount,
  getKashLedger,
  getKashPurchaseQuote,
  getKashStatus,
  getKashSubscription,
  getKashSubscriptionTiers,
  isValidKashAmount,
  postKashClaim,
  postKashPurchase,
  postKashSubscribe,
} from "@/features/portfolio/lib/kash";

// Engine parameters move rarely (price at most 25% a day, everything else by
// config change), so a minute of staleness is invisible and keeps the shared
// status read off the hot path.
const STATUS_STALE_MS = 60 * 1000;

// The account payload changes when the user acts AND when something arrives
// from outside the app entirely — points credited from a swap the user made on
// another surface, or KSH sent to them by someone else. The user's own actions
// invalidate explicitly; this interval exists purely for those OUTSIDE changes,
// which is exactly the case a person is staring at the screen waiting for.
//
// A minute of lag there reads as "the points never arrived". Ten seconds costs
// one small authed GET per wallet and makes the number appear on its own.
const ACCOUNT_POLL_MS = 10 * 1000;

export function useKashStatus() {
  return useQuery({
    queryKey: ["kash", "status"],
    queryFn: getKashStatus,
    staleTime: STATUS_STALE_MS,
    // Pre-launch the engine is not part of the page: no request, no error noise.
    enabled: true,
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
    // Only while the tab is in front. Backgrounded, this was the single most
    // expensive call in the app: a ten second poll that never slept, so one
    // forgotten tab cost 360 authed reads an hour whether or not anyone was
    // there. Every other poll in the app already pauses on blur.
    //
    // The case that comment defended, leaving to a wallet or an explorer and
    // coming back expecting a new number, is what refetchOnWindowFocus is for.
    // Returning to the tab still refetches immediately, so the number appears
    // on its own exactly as before.
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });

  return { ...query, wallet };
}

// The tier catalogue is engine config; it moves on deploys, not minutes.
export function useKashSubscriptionTiers(enabled: boolean) {
  return useQuery({
    queryKey: ["kash", "subscription-tiers"],
    queryFn: getKashSubscriptionTiers,
    staleTime: STATUS_STALE_MS,
    enabled: enabled,
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
// conversion appears without extra wiring — which is what makes it safe to
// hold this stale for a while: closing and reopening the modal within the
// window reuses the cached list instead of re-fetching on every open, and
// the user's own actions still bust the cache the moment they happen.
export function useKashLedger(enabled: boolean) {
  const { user, ready, authenticated } = usePrivy();
  const wallet = getWalletAddress(user, "ethereum");

  return useQuery({
    queryKey: ["kash", "ledger", wallet],
    queryFn: () => getKashLedger(wallet as string),
    enabled: enabled && ready && authenticated && Boolean(wallet),
    staleTime: STATUS_STALE_MS,
  });
}

// Quote for a buy amount, debounced so typing does not fire a request per
// keystroke. An invalid amount disables the query instead of sending it.
// `enabled` lets a caller park this quote while a superseding source (the
// on-chain desk) is live — an idle query instead of a wasted request.
export function useKashPurchaseQuote(usdcAmount: string, enabled = true) {
  const debounced = useDebouncedValue(usdcAmount.trim(), 300);
  return useQuery({
    queryKey: ["kash", "purchase-quote", debounced],
    queryFn: () => getKashPurchaseQuote(debounced),
    enabled: enabled && isValidKashAmount(debounced),
  });
}

// Both mutations settle the account balance server-side, so success refreshes
// every kash read at once rather than patching caches by hand.
/**
 * Refresh every Kash read.
 *
 * Exported because not every balance-changing action is a mutation here: a KSH
 * send is a raw on-chain transfer, so nothing invalidates on its behalf and the
 * card would otherwise show the pre-send balance until the next poll.
 */
export function useInvalidateKash() {
  const queryClient = useQueryClient();
  return () => {
    const refresh = () => queryClient.invalidateQueries({ queryKey: ["kash"] });
    refresh();
    // Hold the "syncing" state open across the whole settle window, so the card
    // shows the numbers are catching up rather than presenting a stale figure
    // as final.
    markKashSyncing(CHAIN_SETTLE_RETRIES_MS[CHAIN_SETTLE_RETRIES_MS.length - 1] ?? 0);
    // A mint or burn is confirmed by the time a mutation resolves, but the RPC
    // replica the engine reads its balances from can still be a block behind.
    // Refetching once more shortly after is what stops a successful claim from
    // appearing to have done nothing.
    CHAIN_SETTLE_RETRIES_MS.forEach((delay) => setTimeout(refresh, delay));
  };
}

/** When to re-check balances after a chain write, in ms. */
const CHAIN_SETTLE_RETRIES_MS = [2500, 6000];

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

/**
 * Settle the wallet's points into KSH now; refreshes the card on success.
 *
 * The route requires a signature proving control of the wallet (see
 * claimSettlementMessage) since no on-chain event backs a claim the way a
 * purchase or a conversion's permit does — so this signs before posting,
 * same shape as any other wallet-gated write in the app.
 */
export function useKashClaim() {
  const invalidate = useInvalidateKash();
  const { signMessage } = useSignMessage();
  return useMutation({
    mutationFn: async ({ wallet }: { wallet: string }) => {
      const timestamp = Date.now();
      const { signature } = await signMessage(
        { message: claimSettlementMessage(wallet, timestamp) },
        { address: wallet }
      );
      return postKashClaim(wallet, signature, timestamp);
    },
    onSuccess: invalidate,
  });
}
