"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuthSession } from "@/hooks/use-auth-session";
import { fetchMyReferral, MY_REFERRAL_KEY } from "@/lib/referral-me";

/**
 * The signed-in wallet's own referral code, for putting on whatever it shares.
 *
 * In hooks/ rather than features/referrals because every feature that can share
 * something needs it, and a feature may not import another feature.
 *
 * The username is preferred when there is one: a link reading /r/adaeze is
 * worth more than /r/7k4m9x2p, and both resolve to the same wallet.
 *
 * Null while signed out, in flight, or on an engine that predates the code.
 * Callers hand it to `withReferral`, which leaves a link untouched when there
 * is nothing to put on it, so no caller needs to branch on this.
 */
const CODE_STALE_MS = 5 * 60 * 1000;

export function useReferralCode(): string | null {
  const { ready, authenticated, evmAddress: wallet } = useAuthSession();

  const query = useQuery({
    queryKey: MY_REFERRAL_KEY(wallet),
    queryFn: () => fetchMyReferral(),
    enabled: ready && authenticated && Boolean(wallet),
    staleTime: CODE_STALE_MS,
    retry: false,
  });

  return query.data?.username ?? query.data?.refCode ?? null;
}
