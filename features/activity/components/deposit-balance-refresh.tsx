"use client";
import { useAuthSession } from "@/hooks/use-auth-session";

import { BELL_POLL_MS, useActivity } from "@/features/activity/hooks/use-activity";
import { useDepositBalanceRefresh } from "@/features/activity/hooks/use-deposit-balance-refresh";

// Refreshes the cache-first balance when a deposit settles, rendering nothing.
//
// A deposit lands while the app is closed, so the only evidence the client ever
// sees is a new inbound transfer in activity.
export function DepositBalanceRefresh() {
  const { evmAddress } = useAuthSession();
  // Same query key as the notification bell. React Query drives a shared key
  // at its shortest observer interval, so asking at the default 60s here
  // silently cancelled the bell's five minute throttle for every dashboard.
  // This only needs to NOTICE an arrival, not watch for one.
  const { items } = useActivity({ pollMs: BELL_POLL_MS });
  useDepositBalanceRefresh(items, evmAddress ?? "");
  return null;
}
