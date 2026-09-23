"use client";

import { useOfframpSettlement } from "@/features/funds/hooks/use-offramp-settlement";

// Follows a bank withdrawal to its payout and reports it, rendering nothing.
//
// Mounted with the session, above every signed-in page, for the same reason as
// BankDepositAnalytics: a user who withdraws and leaves the screen is exactly
// the withdrawal that used to go unreported.
export function BankWithdrawAnalytics() {
  useOfframpSettlement();
  return null;
}
