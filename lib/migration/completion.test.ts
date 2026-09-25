import { describe, expect, it } from "vitest";
import { migrationOutcome } from "@/lib/migration/completion";
import type { SettlementPlan } from "@/lib/migration/schedule";
import type { LegacyHolding, SettleOutcome } from "@/lib/migration/types";

function holding(id: string): LegacyHolding {
  return {
    id,
    venue: "wallet",
    kind: "token",
    label: id,
    amount: 1n,
    decimals: 6,
    symbol: "USDC",
    valueUsd: 1,
    deterministic: true,
    irreversible: false,
    settleability: { state: "now" },
    ref: null,
  };
}

const ok: SettleOutcome = { ok: true, txHashes: ["0x1"] };
const failed: SettleOutcome = { ok: false, error: "boom", retryable: true };

function plan(attempted: string[], later: string[] = []): SettlementPlan {
  return {
    phases: attempted.length ? [{ phase: "sweep", holdings: attempted.map(holding) }] : [],
    settleLater: later.map(holding),
    skipped: [],
  };
}

describe("migrationOutcome", () => {
  it("is complete when everything attempted landed and nothing remains", () => {
    expect(
      migrationOutcome(
        plan(["a", "b"]),
        new Map<string, SettleOutcome>([
          ["a", ok],
          ["b", ok],
        ]),
        0
      )
    ).toBe("complete");
  });

  it("is partial when any attempted step failed or was not reported", () => {
    expect(
      migrationOutcome(
        plan(["a", "b"]),
        new Map<string, SettleOutcome>([
          ["a", ok],
          ["b", failed],
        ]),
        0
      )
    ).toBe("partial");
    expect(migrationOutcome(plan(["a", "b"]), new Map<string, SettleOutcome>([["a", ok]]), 0)).toBe(
      "partial"
    );
  });

  it("is partial when steps landed but something waits for later or a deposit is pending", () => {
    expect(
      migrationOutcome(plan(["a"], ["later"]), new Map<string, SettleOutcome>([["a", ok]]), 0)
    ).toBe("partial");
    expect(migrationOutcome(plan(["a"]), new Map<string, SettleOutcome>([["a", ok]]), 1)).toBe(
      "partial"
    );
  });

  it("is blocked when nothing could be attempted and something remains", () => {
    expect(migrationOutcome(plan([], ["later"]), new Map<string, SettleOutcome>(), 0)).toBe(
      "blocked"
    );
    expect(migrationOutcome(plan([]), new Map<string, SettleOutcome>(), 2)).toBe("blocked");
  });

  it("is complete for an empty plan with nothing pending", () => {
    expect(migrationOutcome(plan([]), new Map<string, SettleOutcome>(), 0)).toBe("complete");
  });
});
