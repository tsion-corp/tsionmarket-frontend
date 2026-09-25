import type { RekeyState } from "@/features/migrate/lib/api";

/**
 * WHICH SCREENS A LEDGER'S RE-KEY LANDS ON.
 *
 * The link moves the person's Kash points, casino balances and the rest by
 * asking each service to re-key its ledger from the old wallet to the new.
 * That happens on the services' own time and is reported back per ledger
 * (`rekey.kash: done`). Until now nothing on this side listened: the Kash
 * chip kept its cached figure for its stale window, so the balance "took a
 * while" to appear when it had in fact moved seconds earlier.
 *
 * Query-key prefixes, not hooks: this is a lib, and the features that own
 * those keys must not be imported from here. The prefixes are the ones the
 * feature hooks build their keys under.
 */
const LEDGER_QUERY_PREFIXES: Record<string, readonly (readonly string[])[]> = {
  kash: [["kash"]],
  cashier: [["casino"]],
  swiss: [["casino"]],
  lottery: [["casino"]],
  arkjet: [["casino"]],
  prediction: [["prediction"]],
  square: [["market-square"]],
};

/** A ledger is settled once the service has answered, whatever it answered. */
export function ledgerSettled(state: RekeyState | undefined): boolean {
  return state === "done" || state === "none" || state === "failed";
}

export function anyLedgerPending(rekey: Record<string, RekeyState> | undefined): boolean {
  return Object.values(rekey ?? {}).some((state) => state === "pending");
}

/**
 * The query-key prefixes to invalidate when `next` is read after `prev`:
 * every ledger that has just become `done`. Deduplicated, so four casino
 * ledgers landing at once cost one invalidation. Pure, so it can be pinned.
 */
export function ledgerRefreshes(
  prev: Record<string, RekeyState> | undefined,
  next: Record<string, RekeyState> | undefined
): readonly (readonly string[])[] {
  const out: (readonly string[])[] = [];
  const seen = new Set<string>();
  for (const [ledger, state] of Object.entries(next ?? {})) {
    if (state !== "done" || prev?.[ledger] === "done") continue;
    for (const prefix of LEDGER_QUERY_PREFIXES[ledger] ?? []) {
      const id = prefix.join("/");
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(prefix);
    }
  }
  return out;
}
