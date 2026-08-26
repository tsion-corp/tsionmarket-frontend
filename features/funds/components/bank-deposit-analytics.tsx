"use client";

import { useOnrampSettlement } from "@/features/funds/hooks/use-onramp-settlement";

// Follows a bank deposit to settlement, rendering nothing.
//
// It has to live outside the funds sheet: the transfer screen is unmounted as
// soon as the sheet closes, and a user who pays their bank and walks away is
// exactly the deposit that used to go unreported. Mounted next to
// DepositAnalytics, which is what turns the arrival it describes into an event.
export function BankDepositAnalytics() {
  useOnrampSettlement();
  return null;
}
