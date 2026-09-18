"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { usePrivy, useSignMessage } from "@privy-io/react-auth";
import { queryKeys } from "@/lib/query-keys";
import { PERSISTED_GC_TIME } from "@/lib/query-persist";
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

// A figure read seconds ago is still the figure: a hop to another page and
// back, or a second card on the same page, must not re-read it.
const ACCOUNT_STALE_MS = 30 * 1000;

export function useKashStatus() {
  return useQuery({
    queryKey: queryKeys.kash.status(),
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
    queryKey: queryKeys.kash.account(wallet),
    queryFn: () => getKashAccount(wallet as string),
    enabled: ready && authenticated && Boolean(wallet),
    staleTime: ACCOUNT_STALE_MS,
    // Persisted to localStorage (query-persist.ts), so a returning user paints
    // the last balance at once. Kept in memory the full persisted window so it
    // survives to be written and restored, like the other persisted reads.
    gcTime: PERSISTED_GC_TIME,
    // No background timer. The balance changes when the user acts (their own
    // actions refresh the card through useInvalidateKash) and when something
    // lands from outside — points from a swap on another surface, KSH sent by
    // someone else, the weekly server settlement. Those outside credits are
    // caught by the read on opening the card and the one on returning to the
    // tab, not a clock: the home page is this card, so a poll here meant the
    // engine saw every signed-in person on a timer for a figure that almost
    // never moves on its own.
    refetchOnWindowFocus: true,
  });

  // The query only runs once Privy has resolved an embedded EVM wallet, so a
  // signed-in user without one stays pending forever. Callers have to tell that
  // apart from a load that is still in flight.
  const walletMissing = ready && authenticated && !wallet;

  return { ...query, wallet, walletMissing };
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
 * Refresh the reads an action can have changed.
 *
 * The account balance and the ledger, and the subscription when the action
 * was an upgrade. Not the engine status or the tier catalogue: those move on
 * deploys, and refetching them three times per action was most of what a
 * buy cost the engine.
 *
 * Exported because not every balance-changing action is a mutation here: a KSH
 * send is a raw on-chain transfer, so nothing invalidates on its behalf and the
 * card would otherwise show the pre-send balance until the next poll.
 */
export function useInvalidateKash(options: { subscription?: boolean } = {}) {
  const queryClient = useQueryClient();
  const { subscription = false } = options;
  return () => {
    const refresh = () => queryClient.invalidateQueries({ queryKey: ["kash", "account"] });
    refresh();
    void queryClient.invalidateQueries({ queryKey: ["kash", "ledger"] });
    if (subscription) void queryClient.invalidateQueries({ queryKey: ["kash", "subscription"] });
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
  const invalidate = useInvalidateKash({ subscription: true });
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
