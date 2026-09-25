// Decides what a finished run means for the migration flag. "complete" is the
// only outcome that retires the Update Balance button and lifts the balance
// mask, and it needs every attempted step to have landed, nothing left for
// later, and no bank deposit still routed to the old wallet.

import type { SettlementPlan } from "@/lib/migration/schedule";
import type { SettleOutcome } from "@/lib/migration/types";

export type MigrationOutcome = "complete" | "partial" | "blocked";

export function migrationOutcome(
  plan: SettlementPlan,
  results: ReadonlyMap<string, SettleOutcome>,
  pendingOnramps: number
): MigrationOutcome {
  const attempted = plan.phases.flatMap((phase) => phase.holdings);
  const failed = attempted.some((h) => {
    const outcome = results.get(h.id);
    return !outcome || !outcome.ok;
  });
  if (failed) return "partial";
  const remaining = plan.settleLater.length + pendingOnramps;
  if (remaining === 0) return "complete";
  // Nothing could even be tried: everything waits on a window, the backend,
  // or a deposit. Distinct from partial so the UI can say so.
  return attempted.length === 0 ? "blocked" : "partial";
}
