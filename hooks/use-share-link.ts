"use client";

import { useCallback } from "react";
import { useReferralCode } from "@/hooks/use-referral-code";
import { withReferral } from "@/lib/referral-code";

/**
 * Turns any link the app is about to hand out into one that earns.
 *
 * Every share surface wants the same two lines — read the signed-in wallet's
 * referral code, put it on the url — so they get one call instead. Returns a
 * stable function rather than a string, because most callers build their url
 * from something they only know at click time (a match id, a market, a room).
 *
 * `withReferral` leaves the url untouched when there is no code yet or when it
 * already carries one, so no caller has to branch and re-sharing somebody
 * else's link never takes their referral off them.
 */
export function useShareLink(): (url: string) => string {
  const code = useReferralCode();
  return useCallback((url: string) => withReferral(url, code), [code]);
}
