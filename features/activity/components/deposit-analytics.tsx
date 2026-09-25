"use client";
import { useAuthSession } from "@/hooks/use-auth-session";

import { BELL_POLL_MS, useActivity } from "@/features/activity/hooks/use-activity";
import { useDepositAnalytics } from "@/features/activity/hooks/use-deposit-analytics";
import { useDepositBalanceRefresh } from "@/features/activity/hooks/use-deposit-balance-refresh";

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
  const { ready, authenticated, evmAddress, solanaAddress, profile } = useAuthSession();
  const addressFor = (chain: string) => (chain === "solana" ? solanaAddress : evmAddress);
  // Same query key as the notification bell. React Query drives a shared key
  // at its shortest observer interval, so asking at the default 60s here
  // silently cancelled the bell's five minute throttle for every dashboard.
  // This only needs to NOTICE an arrival, not watch for one.
  const { items } = useActivity({ pollMs: BELL_POLL_MS });
  const wallet = evmAddress ?? "";
  useDepositAnalytics(items, wallet);
  // A settled deposit is a balance change the cache-first portfolio would
  // otherwise miss until the next transaction; the same arrival refreshes it.
  useDepositBalanceRefresh(items, wallet);
  return null;
}
