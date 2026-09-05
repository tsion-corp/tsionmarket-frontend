"use client";

import { usePrivy } from "@privy-io/react-auth";
import { BELL_POLL_MS, useActivity } from "@/features/activity/hooks/use-activity";
import { useDepositAnalytics } from "@/features/activity/hooks/use-deposit-analytics";
import { getWalletAddress } from "@/lib/user";

// Watches settled deposits and reports them, rendering nothing.
//
// A deposit lands while the app is closed, so the only evidence the client ever
// sees is a new inbound transfer in activity. That watch used to ride along on
// the dashboard's recent-activity list; the list is gone from the dashboard now
// that history has its own page, so the watch is mounted on its own instead.
// Without it `deposit_completed` stops firing and the funding funnel loses its
// last step.
//
// The wallet is what ties an arrival to a bank deposit this device started: a
// Naira credit arrives as Base USDC and is otherwise indistinguishable from a
// chain deposit.
export function DepositAnalytics() {
  const { user } = usePrivy();
  // Same query key as the notification bell. React Query drives a shared key
  // at its shortest observer interval, so asking at the default 60s here
  // silently cancelled the bell's five minute throttle for every dashboard.
  // This only needs to NOTICE an arrival, not watch for one.
  const { items } = useActivity({ pollMs: BELL_POLL_MS });
  useDepositAnalytics(items, getWalletAddress(user, "ethereum") ?? "");
  return null;
}
