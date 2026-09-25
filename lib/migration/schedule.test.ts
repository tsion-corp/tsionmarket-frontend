import { describe, expect, it } from "vitest";
import { isSettleable, scheduleSettlement, sumValueUsd } from "@/lib/migration/schedule";
import type { LegacyHolding, Settleability, Venue } from "@/lib/migration/types";

const NOW = 1_000_000;

function holding(
  id: string,
  venue: Venue,
  kind: string,
  overrides: Partial<LegacyHolding> = {}
): LegacyHolding {
  return {
    id,
    venue,
    kind,
    label: id,
    amount: 1n,
    decimals: 6,
    symbol: "USDC",
    valueUsd: 1,
    deterministic: true,
    irreversible: false,
    settleability: { state: "now" },
    ref: null,
    ...overrides,
  };
}

const lossy = (id: string, venue: Venue, kind: string, extra: Partial<LegacyHolding> = {}) =>
  holding(id, venue, kind, { deterministic: false, irreversible: true, ...extra });

describe("scheduleSettlement", () => {
  it("orders phases claims, closes, settle, sweep and drops empty phases", () => {
    const plan = scheduleSettlement(
      [
        holding("w", "wallet", "token"),
        lossy("p", "perps", "position"),
        holding("c", "cashier", "available"),
        holding("pc", "polymarket", "collateral"),
      ],
      new Set(["p"]),
      NOW
    );

    expect(plan.phases.map((p) => p.phase)).toEqual(["claims", "closes", "settle", "sweep"]);
    expect(scheduleSettlement([holding("w", "wallet", "token")], new Set(), NOW).phases).toEqual([
      { phase: "sweep", holdings: [holding("w", "wallet", "token")] },
    ]);
  });

  it("orders claims by venue: cashier, kash, vault, cpmm, earn, polymarket", () => {
    const plan = scheduleSettlement(
      [
        holding("e", "earn", "escrow"),
        holding("pm", "polymarket", "redeem"),
        holding("v", "vault", "pending"),
        holding("k", "kash", "points"),
        holding("cp", "cpmm", "redeem"),
        holding("c", "cashier", "available"),
      ],
      new Set(),
      NOW
    );

    expect(plan.phases[0].holdings.map((h) => h.id)).toEqual(["c", "k", "v", "cp", "e", "pm"]);
  });

  it("orders closes: perp orders, perp positions, polymarket shares, cpmm shares, cpmm lp", () => {
    const ids = ["lp", "cs", "ps", "pp", "po"];
    const plan = scheduleSettlement(
      [
        lossy("lp", "cpmm", "lp"),
        lossy("cs", "cpmm", "shares"),
        lossy("ps", "polymarket", "shares"),
        lossy("pp", "perps", "position"),
        lossy("po", "perps", "order"),
      ],
      new Set(ids),
      NOW
    );

    expect(plan.phases[0].holdings.map((h) => h.id)).toEqual(["po", "pp", "ps", "cs", "lp"]);
  });

  it("keeps lossy holdings out of the plan unless opted in", () => {
    const plan = scheduleSettlement(
      [lossy("a", "perps", "position"), lossy("b", "perps", "position")],
      new Set(["b"]),
      NOW
    );

    expect(plan.phases).toEqual([
      { phase: "closes", holdings: [lossy("b", "perps", "position")] },
      // The close pays into the old wallet, so the sweep trails it even with
      // nothing discovered there to sweep.
      { phase: "sweep", holdings: [] },
    ]);
    expect(plan.settleLater.map((h) => h.id)).toEqual(["a"]);
  });

  it("sweeps a chain's native coin after its tokens", () => {
    const plan = scheduleSettlement(
      [
        holding("eth", "wallet", "native"),
        holding("usdc", "wallet", "token"),
        holding("wsws", "wallet", "token"),
      ],
      new Set(),
      NOW
    );

    expect(plan.phases[0].holdings.map((h) => h.id)).toEqual(["usdc", "wsws", "eth"]);
  });

  it("defers challenge windows until they open, and backend and onramp items always", () => {
    const openLater: Settleability = { state: "waitUntil", at: NOW + 1, reason: "challengeWindow" };
    const openNow: Settleability = { state: "waitUntil", at: NOW, reason: "challengeWindow" };
    const plan = scheduleSettlement(
      [
        holding("later", "cpmm", "redeem", { settleability: openLater }),
        holding("now", "cpmm", "redeem", { settleability: openNow }),
        holding("be", "cashier", "locked", {
          settleability: { state: "needsBackend", reason: "lockedBucket" },
        }),
        holding("on", "onramp", "onramp", {
          settleability: { state: "pending", reason: "onramp" },
        }),
      ],
      new Set(),
      NOW
    );

    expect(plan.phases[0].holdings.map((h) => h.id)).toEqual(["now"]);
    expect(plan.settleLater.map((h) => h.id)).toEqual(["later", "be", "on"]);
  });

  it("skips stranded holdings instead of deferring them", () => {
    const plan = scheduleSettlement(
      [
        holding("avax", "wallet", "native", {
          settleability: { state: "stranded", reason: "unsponsoredNetwork" },
        }),
      ],
      new Set(),
      NOW
    );

    expect(plan.phases).toEqual([]);
    expect(plan.settleLater).toEqual([]);
    expect(plan.skipped.map((h) => h.id)).toEqual(["avax"]);
  });

  it("places every input holding in exactly one bucket", () => {
    const inputs: LegacyHolding[] = [
      holding("a", "wallet", "token"),
      holding("b", "wallet", "native"),
      lossy("c", "perps", "position"),
      lossy("d", "perps", "order"),
      holding("e", "cpmm", "claim"),
      holding("f", "cpmm", "redeem", {
        settleability: { state: "waitUntil", at: NOW + 5, reason: "challengeWindow" },
      }),
      holding("g", "kash", "tier", {
        settleability: { state: "needsBackend", reason: "subscriptionTier" },
      }),
      holding("h", "polymarket", "collateral"),
      lossy("i", "polymarket", "shares", {
        settleability: { state: "stranded", reason: "noLiquidity" },
      }),
      holding("j", "onramp", "onramp", { settleability: { state: "pending", reason: "onramp" } }),
    ];
    const plan = scheduleSettlement(inputs, new Set(["c"]), NOW);

    const placed = [
      ...plan.phases.flatMap((p) => p.holdings),
      ...plan.settleLater,
      ...plan.skipped,
    ].map((h) => h.id);
    expect(placed.sort()).toEqual(inputs.map((h) => h.id).sort());
    expect(new Set(placed).size).toBe(inputs.length);
  });
});

describe("helpers", () => {
  it("isSettleable treats a window that has opened as settleable", () => {
    expect(
      isSettleable(
        holding("x", "cpmm", "redeem", {
          settleability: { state: "waitUntil", at: NOW - 1, reason: "challengeWindow" },
        }),
        NOW
      )
    ).toBe(true);
    expect(
      isSettleable(
        holding("x", "cpmm", "redeem", {
          settleability: { state: "waitUntil", at: NOW + 1, reason: "challengeWindow" },
        }),
        NOW
      )
    ).toBe(false);
  });

  it("sumValueUsd totals display values", () => {
    expect(
      sumValueUsd([
        holding("a", "wallet", "token", { valueUsd: 1.5 }),
        holding("b", "wallet", "token", { valueUsd: 2.25 }),
      ])
    ).toBe(3.75);
  });
});

describe("the sweep phase survives an empty wallet", () => {
  // runSettlement re-discovers the wallet at the start of the sweep, because
  // claims and closes pay into it. Dropping the phase for want of a discovered
  // balance is what would leave those proceeds behind.
  it("keeps the sweep when a close pays into an old wallet that held nothing", () => {
    const plan = scheduleSettlement([lossy("p", "perps", "position")], new Set(["p"]), NOW);
    expect(plan.phases.map((p) => p.phase)).toEqual(["closes", "sweep"]);
    expect(plan.phases.at(-1)?.holdings).toEqual([]);
  });

  it("keeps the sweep after a deterministic claim", () => {
    const plan = scheduleSettlement([holding("c", "cashier", "available")], new Set(), NOW);
    expect(plan.phases.map((p) => p.phase)).toEqual(["claims", "sweep"]);
  });

  it("adds no sweep when nothing pays into the wallet", () => {
    const plan = scheduleSettlement([holding("pc", "polymarket", "collateral")], new Set(), NOW);
    expect(plan.phases.map((p) => p.phase)).toEqual(["settle"]);
  });

  it("adds no sweep when the only holdings wait or are stranded", () => {
    const plan = scheduleSettlement(
      [
        lossy("p", "perps", "position"),
        holding("s", "kash", "tier", {
          settleability: { state: "stranded", reason: "unsponsoredNetwork" } as Settleability,
        }),
      ],
      new Set(),
      NOW
    );
    expect(plan.phases).toEqual([]);
    expect(plan.settleLater.map((h) => h.id)).toEqual(["p"]);
  });
});
