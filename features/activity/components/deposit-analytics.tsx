"use client";

import { useActivity } from "@/features/activity/hooks/use-activity";
import { useDepositAnalytics } from "@/features/activity/hooks/use-deposit-analytics";

// Watches settled deposits and reports them, rendering nothing.
//
// A deposit lands while the app is closed, so the only evidence the client ever
// sees is a new inbound transfer in activity. That watch used to ride along on
// the dashboard's recent-activity list; the list is gone from the dashboard now
// that history has its own page, so the watch is mounted on its own instead.
// Without it `deposit_completed` stops firing and the funding funnel loses its
// last step.
export function DepositAnalytics() {
  const { items } = useActivity();
  useDepositAnalytics(items);
  return null;
}
