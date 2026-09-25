import { describe, expect, it } from "vitest";
import { anyLedgerPending, ledgerRefreshes, ledgerSettled } from "./ledger-rekeys";

describe("which screens a ledger's re-key lands on", () => {
  it("refreshes Kash the moment its ledger reports done", () => {
    expect(ledgerRefreshes({ kash: "pending" }, { kash: "done" })).toEqual([["kash"]]);
  });

  // Reading the same answer twice must not refetch twice.
  it("refreshes only on the transition, never on a repeat", () => {
    expect(ledgerRefreshes({ kash: "done" }, { kash: "done" })).toEqual([]);
    expect(ledgerRefreshes(undefined, { kash: "done" })).toEqual([["kash"]]);
  });

  it("collapses the casino ledgers onto one refresh", () => {
    const next = { cashier: "done", arkjet: "done", lottery: "done", swiss: "pending" } as const;
    expect(ledgerRefreshes({}, next)).toEqual([["casino"]]);
  });

  // `none` and `failed` change nothing on screen; there is nothing to refetch.
  it("does not refetch for a ledger with nothing to move, or one that failed", () => {
    expect(ledgerRefreshes({}, { kash: "none", prediction: "failed" })).toEqual([]);
  });

  it("knows when the services are still working and when they have answered", () => {
    expect(anyLedgerPending({ kash: "pending", cashier: "done" })).toBe(true);
    expect(anyLedgerPending({ kash: "done", cashier: "none" })).toBe(false);
    expect(anyLedgerPending(undefined)).toBe(false);
    expect(ledgerSettled("done")).toBe(true);
    expect(ledgerSettled("pending")).toBe(false);
    expect(ledgerSettled(undefined)).toBe(false);
  });
});
