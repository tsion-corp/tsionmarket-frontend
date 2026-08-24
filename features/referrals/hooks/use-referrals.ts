"use client";

import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { usePrivy } from "@privy-io/react-auth";
import { useTranslations } from "next-intl";
import { getWalletAddress } from "@/lib/user";
import { toast } from "@/lib/toast";
import {
  getMyReferralStats,
  getUsernameAvailability,
  postReferralClaim,
  putUsername,
  usernameProblem,
} from "@/features/referrals/lib/referrals";
import { clearRefCode, readRefCode } from "@/features/referrals/lib/ref-cookie";

// Counts move when someone the user invited deposits, which can happen while
// the modal is open. A slow poll keeps the number honest without hammering
// the identity-verified endpoint.
const STATS_POLL_MS = 30 * 1000;

export function useReferralStats(enabled: boolean) {
  const { user, ready, authenticated } = usePrivy();
  const wallet = getWalletAddress(user, "ethereum");

  return useQuery({
    queryKey: ["referrals", "me", wallet],
    queryFn: getMyReferralStats,
    enabled: enabled && ready && authenticated && Boolean(wallet),
    refetchInterval: STATS_POLL_MS,
  });
}

// Availability for the name being typed. Local format problems never reach the
// network; only a well-formed candidate is checked upstream.
export function useUsernameAvailability(name: string) {
  const valid = name.length > 0 && usernameProblem(name) === null;

  return useQuery({
    queryKey: ["referrals", "available", name],
    queryFn: () => getUsernameAvailability(name),
    enabled: valid,
    staleTime: 10 * 1000,
  });
}

export function useSetUsername() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: putUsername,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["referrals"] });
    },
  });
}

// One-shot claim of a referral link. If the visitor arrived through
// /r/<username>, the cookie holds the code; once a session exists this posts
// the claim and clears the cookie. Any definitive answer clears it too: a 409
// means the wallet already has a referrer (or clicked its own link), a 404
// that the code no longer exists. Transient failures keep the cookie so the
// next visit retries.
export function useClaimReferralFromLink() {
  const { ready, authenticated } = usePrivy();
  const queryClient = useQueryClient();
  const t = useTranslations("referral");
  const fired = useRef(false);

  useEffect(() => {
    if (!ready || !authenticated || fired.current) return;
    const code = readRefCode();
    if (!code) return;
    fired.current = true;

    postReferralClaim(code).then(
      () => {
        clearRefCode();
        toast.success(t("applied"));
        void queryClient.invalidateQueries({ queryKey: ["referrals"] });
      },
      (error: unknown) => {
        const status = (error as { status?: number }).status;
        if (typeof status === "number" && status >= 400 && status < 500 && status !== 401) {
          clearRefCode();
        }
      }
    );
  }, [ready, authenticated, queryClient, t]);
}
