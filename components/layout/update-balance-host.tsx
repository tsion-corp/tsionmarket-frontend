"use client";

import { UpdateBalanceButton } from "@/features/migrate/components/update-balance-button";

/** The balance card's door. Kept as a host so its import site stays the same. */
export function UpdateBalanceHost() {
  return <UpdateBalanceButton />;
}

export default UpdateBalanceHost;
