// Executes a settlement plan: phase by phase, venue by venue, one signer, so
// every step lands before the next reads its result. The wallet venue is
// re-discovered right before the sweep because every earlier phase paid into
// the old wallet. Pure apart from the adapters it is handed, so the ordering
// and the bookkeeping are tested with fakes.

import { migrationOutcome, type MigrationOutcome } from "@/lib/migration/completion";
import { isSettleable, type SettlementPlan } from "@/lib/migration/schedule";
import type {
  LegacyHolding,
  SettleContext,
  SettleOutcome,
  Venue,
  VenueAdapter,
} from "@/lib/migration/types";

export interface RunResult {
  plan: SettlementPlan;
  results: Map<string, SettleOutcome>;
  outcome: MigrationOutcome;
  // Display total of the holdings that settled.
  movedUsd: number;
  // How many holdings actually settled. Above zero means money left the old
  // wallet, even on a partial run, so the balance mask can come off.
  movedCount: number;
}

export interface RunHooks {
  onStep?(holding: LegacyHolding, outcome: SettleOutcome): void;
  // Emitted before an irreversible venue step starts, for analytics.
  onIrreversible?(holdings: LegacyHolding[]): void;
}

// Holdings in a phase, grouped by venue in first-seen order.
export function groupByVenue(holdings: readonly LegacyHolding[]): Map<Venue, LegacyHolding[]> {
  const groups = new Map<Venue, LegacyHolding[]>();
  for (const holding of holdings) {
    const group = groups.get(holding.venue);
    if (group) group.push(holding);
    else groups.set(holding.venue, [holding]);
  }
  return groups;
}

const NOT_ATTEMPTED: SettleOutcome = {
  ok: false,
  error: "Not attempted.",
  retryable: true,
};

export async function runSettlement(
  plan: SettlementPlan,
  adapters: readonly VenueAdapter[],
  ctx: SettleContext,
  hooks: RunHooks = {}
): Promise<RunResult> {
  const byVenue = new Map(adapters.map((a) => [a.venue, a]));
  const results = new Map<string, SettleOutcome>();
  const record = (holding: LegacyHolding, outcome: SettleOutcome) => {
    console.log(
      `[migrate]   ${outcome.ok ? "moved" : "failed"} ${holding.label}` +
        (outcome.ok
          ? outcome.txHashes?.length
            ? ` (${outcome.txHashes[0]})`
            : ""
          : `: ${outcome.error}`)
    );
    results.set(holding.id, outcome);
    hooks.onStep?.(holding, outcome);
  };
  // The plan the outcome is judged against. The sweep phase is replaced by
  // the live wallet contents once the earlier phases have paid out.
  const executed: SettlementPlan = { ...plan, phases: [] };

  for (const phase of plan.phases) {
    let holdings = phase.holdings;
    if (phase.phase === "sweep") {
      const wallet = byVenue.get("wallet");
      if (wallet && !ctx.signal.aborted) {
        ctx.onProgress("Checking your old account");
        try {
          const fresh = await wallet.discover(ctx);
          holdings = fresh.filter((h) => isSettleable(h, Date.now()));
        } catch (error) {
          // Fall back to the planned sweep rather than skipping it; the
          // sweep itself reads exact balances again.
          console.error("Wallet re-discovery before the sweep failed", error);
        }
      }
    }
    executed.phases.push({ phase: phase.phase, holdings });

    for (const [venue, group] of groupByVenue(holdings)) {
      if (ctx.signal.aborted) {
        for (const h of group) record(h, { ok: false, error: "Cancelled.", retryable: true });
        continue;
      }
      const adapter = byVenue.get(venue);
      if (!adapter) {
        for (const h of group) {
          record(h, { ok: false, error: `No adapter for ${venue}.`, retryable: false });
        }
        continue;
      }
      if (group.some((h) => h.irreversible)) hooks.onIrreversible?.(group);
      let outcomes: Map<string, SettleOutcome>;
      try {
        outcomes = await adapter.settle(group, ctx);
      } catch (error) {
        console.error(`Migration settle failed for ${venue}`, error);
        const message = error instanceof Error ? error.message : String(error);
        outcomes = new Map(
          group.map((h) => [h.id, { ok: false, error: message, retryable: true }])
        );
      }
      for (const h of group) record(h, outcomes.get(h.id) ?? NOT_ATTEMPTED);
    }
  }

  const pendingOnramps = plan.settleLater.filter((h) => h.settleability.state === "pending").length;
  const outcome = migrationOutcome(executed, results, pendingOnramps);
  const settled = executed.phases.flatMap((p) => p.holdings).filter((h) => results.get(h.id)?.ok);
  const movedUsd = settled.reduce((sum, h) => sum + h.valueUsd, 0);
  return { plan: executed, results, outcome, movedUsd, movedCount: settled.length };
}
