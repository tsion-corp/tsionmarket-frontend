// Turns discovered holdings into an ordered settlement plan. Pure, so the
// ordering rules that keep money from being stranded are unit tested:
// deterministic payouts first (they only add to the old wallet), the user's
// opted-in closes next, Polymarket collateral delivered to the new wallet,
// and the plain wallet sweep last so everything paid out is swept too.

import type { LegacyHolding, Settleability, Venue } from "@/lib/migration/types";

export type Phase = "claims" | "closes" | "settle" | "sweep";

export interface SettlementPhase {
  phase: Phase;
  holdings: LegacyHolding[];
}

export interface SettlementPlan {
  phases: SettlementPhase[];
  // Could not or should not run now: unchecked lossy items, challenge
  // windows, backend re-keys, in-flight onramps. The review lists them.
  settleLater: LegacyHolding[];
  // Cannot run at all from this app: unsponsored networks, insolvent markets.
  skipped: LegacyHolding[];
}

export function isSettleable(holding: LegacyHolding, now: number): boolean {
  const s: Settleability = holding.settleability;
  return s.state === "now" || (s.state === "waitUntil" && s.at !== null && s.at <= now);
}

export function sumValueUsd(holdings: readonly LegacyHolding[]): number {
  return holdings.reduce((sum, h) => sum + h.valueUsd, 0);
}

// Deterministic payouts, cheapest and most certain first. Every one of these
// lands in the old wallet, where the sweep picks it up.
const CLAIMS_ORDER: readonly Venue[] = ["cashier", "kash", "vault", "cpmm", "earn", "polymarket"];

// Opted-in lossy actions. Orders before positions so freed collateral is not
// re-locked; venue sells after on-chain closes so their proceeds settle in
// one place.
const CLOSES_ORDER: readonly [Venue, string][] = [
  ["perps", "order"],
  ["perps", "position"],
  ["polymarket", "shares"],
  ["cpmm", "shares"],
  ["cpmm", "lp"],
];

function rank<T>(order: readonly T[], find: (entry: T) => boolean): number {
  const index = order.findIndex(find);
  return index === -1 ? order.length : index;
}

function phaseOf(holding: LegacyHolding): Phase {
  if (holding.venue === "wallet") return "sweep";
  // Polymarket collateral is delivered straight to the new wallet after the
  // venue's own redeems and sells, so it never needs the sweep.
  if (holding.venue === "polymarket" && holding.kind === "collateral") return "settle";
  return holding.deterministic ? "claims" : "closes";
}

export function scheduleSettlement(
  holdings: readonly LegacyHolding[],
  optIn: ReadonlySet<string>,
  now: number
): SettlementPlan {
  const buckets: Record<Phase, LegacyHolding[]> = { claims: [], closes: [], settle: [], sweep: [] };
  const settleLater: LegacyHolding[] = [];
  const skipped: LegacyHolding[] = [];

  for (const holding of holdings) {
    if (holding.settleability.state === "stranded") {
      skipped.push(holding);
      continue;
    }
    if (!isSettleable(holding, now)) {
      settleLater.push(holding);
      continue;
    }
    if (!holding.deterministic && !optIn.has(holding.id)) {
      settleLater.push(holding);
      continue;
    }
    buckets[phaseOf(holding)].push(holding);
  }

  buckets.claims.sort(
    (a, b) => rank(CLAIMS_ORDER, (v) => v === a.venue) - rank(CLAIMS_ORDER, (v) => v === b.venue)
  );
  buckets.closes.sort(
    (a, b) =>
      rank(CLOSES_ORDER, ([v, k]) => v === a.venue && k === a.kind) -
      rank(CLOSES_ORDER, ([v, k]) => v === b.venue && k === b.kind)
  );
  // Within the sweep, tokens before the chain's native coin: the native
  // balance is the last thing to leave a wallet.
  buckets.sweep.sort((a, b) => Number(a.kind === "native") - Number(b.kind === "native"));

  // Claims and closes both pay into the old wallet, so the sweep has to run
  // even when discovery found nothing there to sweep: runSettlement
  // re-discovers the wallet at the start of that phase, and with no phase
  // there is nothing to re-discover into. An old account holding only a
  // position would otherwise close it and leave the proceeds behind.
  const paysIntoWallet = buckets.claims.length > 0 || buckets.closes.length > 0;
  const phases: SettlementPhase[] = (["claims", "closes", "settle", "sweep"] as const)
    .filter((phase) => buckets[phase].length > 0 || (phase === "sweep" && paysIntoWallet))
    .map((phase) => ({ phase, holdings: buckets[phase] }));

  return { phases, settleLater, skipped };
}
