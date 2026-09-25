"use client";

import { useMemo } from "react";
import { useAuthSession } from "@/hooks/use-auth-session";
import { useSessionWallet } from "@/components/providers/server-session";
import { useUserBalance } from "@/hooks/use-user-balance";
import { embeddedWallets, spendableCash } from "@/lib/balance/spendable";
import { readyToSpendOf, type ReadyToSpend } from "@/features/portfolio/lib/ready-to-spend";

// The user-management balance endpoint, narrowed to the one figure a screen
// can act on: what a purchase or a withdrawal can actually draw on today.
//
// Two halves, and the seam between them is the whole point. useUserBalance
// reports every wallet LINKED to the account, including ones the user
// connected themselves; this app can only sign for the wallet the session
// embeds for it. So the endpoint's answer is intersected with the addresses
// from the session before a penny of it is counted
// (ADR-2026-09-23-user-balance-endpoint, "It answers a different question
// about whose money it is").
//
// Everything stays a string until the card's display edge. Nothing here calls
// Number().

export interface SpendableCashResult {
  /**
   * Exact spendable cash as a decimal string, or null when it is not known.
   * Null is never a zero — see lib/balance/spendable.ts.
   */
  cash: string | null;
  /** The same figure in the three states a card has to draw. */
  readyToSpend: ReadyToSpend;
  /** A read behind a figure already on screen: a hint, not a skeleton. */
  isRefreshing: boolean;
  error: unknown;
  refetch(): void;
}

/**
 * The embedded wallet addresses this app can sign for, from the session.
 *
 * While the session is still hydrating, the server's verified session stands
 * in — the same wallet, read from the same account, a moment earlier
 * (useSessionWallet). Once it is ready its answer is the only one, INCLUDING
 * an empty one, so a signed-out tab cannot keep counting the wallet the cookie
 * named when the page rendered.
 *
 * Solana is left out: this endpoint reports Base alone today and every wallet
 * entry carries `slot: null`, so a Solana address could only ever match
 * nothing. Kept as a list, which is what the intersection takes: a Decane
 * session embeds one EVM wallet, and a second one, should the session ever
 * carry it, must be counted rather than silently dropped — an understated
 * figure is exactly what holds the withdraw button shut.
 */
function useEmbeddedAddresses(): string[] {
  const { ready, evmAddress } = useAuthSession();
  const fromServerSession = useSessionWallet("ethereum");

  return useMemo(() => {
    if (!ready) return fromServerSession ? [fromServerSession] : [];
    return evmAddress ? [evmAddress] : [];
  }, [ready, evmAddress, fromServerSession]);
}

/**
 * Spendable stablecoin cash across the wallets this app controls.
 *
 * An empty address list is carried through as "not known" rather than as zero:
 * embeddedWallets() answers null for it, and spendableCash() passes that null
 * along. That is deliberate — getEmbeddedWallets() answers [] both for an
 * account it has not loaded and for one that genuinely holds no wallet, and
 * from here the two are indistinguishable.
 */
export function useSpendableCash(): SpendableCashResult {
  const addresses = useEmbeddedAddresses();
  const { balance, isLoading, isRefreshing, error, refetch } = useUserBalance();
  const { ready } = useAuthSession();

  const cash = useMemo(
    () => spendableCash(embeddedWallets(balance, addresses)),
    [balance, addresses]
  );

  // Still early rather than unknown: the query is disabled until the session
  // names an account, so "no balance yet, no error yet" is a read that has not
  // happened rather than one that failed.
  const pending = isLoading || !ready || (balance === null && error == null);

  return {
    cash,
    readyToSpend: readyToSpendOf({ cash, pending, error }),
    isRefreshing,
    error,
    refetch,
  };
}
