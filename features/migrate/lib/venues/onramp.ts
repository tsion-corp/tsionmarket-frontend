"use client";

// Bank deposits in flight to the OLD wallet. Their destination was frozen when
// the order was created and no rail exposes an update, so nothing here can
// be settled: the holding exists so the review says the money is coming, the
// caches are left alone (clearing them would hide a live account number), and
// completion waits for it.

import { loadCachedOnrampAccount } from "@/lib/ramping/account-cache";
import { isPendingBankDepositActive, pendingBankDepositSnapshot } from "@/lib/ramping/pending";
import { isPendingOnrampActive, pendingOnrampSnapshot } from "@/lib/pouch/pending";
import { holdingId } from "@/lib/migration/holding";
import type { LegacyHolding, VenueAdapter } from "@/lib/migration/types";

export interface OnrampRef {
  source: "ramping-account" | "ramping-pending" | "pouch-pending";
  id: string;
}

function pendingHolding(ref: OnrampRef, label: string): LegacyHolding<OnrampRef> {
  return {
    id: holdingId("onramp", ref.source, ref.id),
    venue: "onramp",
    kind: "onramp",
    label,
    amount: 0n,
    decimals: 6,
    symbol: "USDC",
    valueUsd: 0,
    deterministic: true,
    irreversible: false,
    settleability: { state: "pending", reason: "onramp" },
    ref,
  };
}

// Pure: the local caches to holdings. Exported for its test.
export function onrampHoldings(input: {
  legacyEvm: string | null;
  cachedAccountOrderId: string | null;
  pendingBankDeposit: { orderId: string } | null;
  pendingPouchOnramp: { sessionId: string } | null;
}): LegacyHolding<OnrampRef>[] {
  const holdings: LegacyHolding<OnrampRef>[] = [];
  if (input.legacyEvm && input.cachedAccountOrderId) {
    holdings.push(
      pendingHolding(
        { source: "ramping-account", id: input.cachedAccountOrderId },
        "Bank transfers still pointing at your old account"
      )
    );
  }
  if (input.pendingBankDeposit) {
    holdings.push(
      pendingHolding(
        { source: "ramping-pending", id: input.pendingBankDeposit.orderId },
        "Bank deposit settling"
      )
    );
  }
  if (input.pendingPouchOnramp) {
    holdings.push(
      pendingHolding(
        { source: "pouch-pending", id: input.pendingPouchOnramp.sessionId },
        "Card deposit settling"
      )
    );
  }
  return holdings;
}

export const onrampAdapter: VenueAdapter<OnrampRef> = {
  venue: "onramp",
  requiresLegacySession: false,
  async discover({ legacy }) {
    const now = Date.now();
    const bank = pendingBankDepositSnapshot();
    const pouch = pendingOnrampSnapshot();
    return onrampHoldings({
      legacyEvm: legacy.evm,
      cachedAccountOrderId: legacy.evm
        ? (loadCachedOnrampAccount(legacy.evm)?.orderId ?? null)
        : null,
      pendingBankDeposit: isPendingBankDepositActive(bank, now) ? bank : null,
      pendingPouchOnramp: isPendingOnrampActive(pouch, now) ? pouch : null,
    });
  },
  async settle() {
    // Nothing to do: the deposit lands on its own, and the wallet sweep on a
    // later run moves it. The scheduler never hands these to settle.
    return new Map();
  },
};
