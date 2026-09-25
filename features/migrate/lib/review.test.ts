import { describe, expect, it } from "vitest";
import {
  blockingHoldings,
  byVenue,
  defaultOptIn,
  isCoreAsset,
  isThrottled,
  reasonKey,
  reviewGroups,
  worthShowing,
} from "@/features/migrate/lib/review";
import type { LegacyHolding, Venue } from "@/lib/migration/types";

const NOW = 1_700_000_000_000;

function holding(id: string, venue: Venue, overrides: Partial<LegacyHolding> = {}): LegacyHolding {
  return {
    id,
    venue,
    kind: "x",
    label: id,
    amount: 1n,
    decimals: 6,
    symbol: "USDC",
    valueUsd: 10,
    deterministic: true,
    irreversible: false,
    settleability: { state: "now" },
    ref: null,
    ...overrides,
  };
}

describe("reviewGroups", () => {
  it("partitions holdings and totals only what will move", () => {
    const holdings = [
      holding("a", "wallet"),
      holding("b", "perps", { deterministic: false, kind: "position" }),
      holding("c", "perps", { deterministic: false, kind: "order", valueUsd: 5 }),
      holding("d", "cpmm", {
        settleability: { state: "waitUntil", at: NOW + 1, reason: "challengeWindow" },
      }),
      holding("e", "cpmm", {
        settleability: { state: "waitUntil", at: NOW - 1, reason: "challengeWindow" },
      }),
      holding("f", "wallet", {
        settleability: { state: "stranded", reason: "unsponsoredNetwork" },
      }),
      holding("g", "onramp", { settleability: { state: "pending", reason: "onramp" } }),
    ];
    const groups = reviewGroups(holdings, new Set(["c"]), NOW);

    expect(groups.automatic.map((h) => h.id)).toEqual(["a", "e"]);
    expect(groups.optIn.map((h) => h.id)).toEqual(["b", "c"]);
    expect(groups.later.map((h) => h.id)).toEqual(["d", "g"]);
    expect(groups.skipped.map((h) => h.id)).toEqual(["f"]);
    expect(groups.movingUsd).toBe(25);
  });
});

describe("defaultOptIn", () => {
  it("pre-checks perp orders only", () => {
    const holdings = [
      holding("order", "perps", { deterministic: false, kind: "order" }),
      holding("position", "perps", { deterministic: false, kind: "position" }),
      holding("shares", "polymarket", { deterministic: false, kind: "shares" }),
      holding("auto", "wallet"),
    ];
    expect([...defaultOptIn(holdings)]).toEqual(["order"]);
  });
});

describe("reasonKey", () => {
  it("names every non-moving state and nothing for a moving one", () => {
    expect(reasonKey({ state: "now" })).toBeNull();
    expect(reasonKey({ state: "waitUntil", at: null, reason: "awaitingResolution" })).toBe(
      "awaitingResolution"
    );
    expect(reasonKey({ state: "needsBackend", reason: "lockedBucket" })).toBe("lockedBucket");
    expect(reasonKey({ state: "stranded", reason: "noLiquidity" })).toBe("noLiquidity");
    expect(reasonKey({ state: "pending", reason: "onramp" })).toBe("onramp");
  });
});

describe("byVenue", () => {
  it("groups in the given venue order, unknown venues last", () => {
    const groups = byVenue(
      [holding("1", "kash"), holding("2", "wallet"), holding("3", "kash"), holding("4", "earn")],
      ["wallet", "kash"]
    );
    expect(groups.map((g) => [g.venue, g.holdings.length])).toEqual([
      ["wallet", 1],
      ["kash", 2],
      ["earn", 1],
    ]);
  });
});

describe("isCoreAsset", () => {
  const base: LegacyHolding = {
    id: "x",
    venue: "wallet",
    kind: "token",
    label: "x",
    amount: 1n,
    decimals: 6,
    symbol: "USDC",
    valueUsd: 1,
    deterministic: true,
    irreversible: false,
    settleability: { state: "now" },
    ref: null,
  };

  it("holds the gate on native, the stablecoins and Kash", () => {
    expect(isCoreAsset({ ...base, kind: "native", symbol: "ETH" })).toBe(true);
    expect(isCoreAsset({ ...base, symbol: "USDC" })).toBe(true);
    expect(isCoreAsset({ ...base, venue: "kash", symbol: "KSH" })).toBe(true);
    expect(isCoreAsset({ ...base, symbol: "PEPE" })).toBe(false);
  });

  // The prediction balance is USDC, but it moves through a relayer that
  // throttles, and a "slow down" from it used to hold the whole upgrade.
  it("never holds the gate on Polymarket, whatever the symbol", () => {
    expect(isCoreAsset({ ...base, venue: "polymarket", kind: "collateral" })).toBe(false);
  });
});

describe("isThrottled", () => {
  it("is only a failure the venue asked to wait on", () => {
    expect(isThrottled({ ok: false, error: "busy", retryable: true, throttled: true })).toBe(true);
    expect(isThrottled({ ok: false, error: "reverted", retryable: true })).toBe(false);
    expect(isThrottled({ ok: true, txHashes: [] })).toBe(false);
    expect(isThrottled(undefined)).toBe(false);
  });
});

describe("worthShowing", () => {
  const bal = (amount: bigint, valueUsd = 0): LegacyHolding => ({
    ...holding("h", "wallet"),
    amount,
    valueUsd,
  });

  it("shows anything with a balance, whatever it is priced at", () => {
    // The case that prompted this: a price feed drops out and every token
    // reports $0. A held token must still show and still move.
    expect(worthShowing(bal(1n, 0))).toBe(true);
    expect(worthShowing(bal(1_000_000n, 0))).toBe(true);
    expect(worthShowing(bal(5n, 12.5))).toBe(true);
  });

  it("hides only what has no balance", () => {
    expect(worthShowing(bal(0n, 100))).toBe(false);
  });
});

describe("blockingHoldings", () => {
  const ok = (...ids: string[]) => ({
    results: new Map(ids.map((id) => [id, { ok: true as const, txHashes: [] }])),
  });
  const failed = (...ids: string[]) => ({
    results: new Map(ids.map((id) => [id, { ok: false as const, error: "x", retryable: true }])),
  });

  // Seen live: "Partly moved, Failed 0, Waiting 0", the gate shut, no retry.
  // The opted-in run had moved the money; only the automatic run was being
  // subtracted, so the count still said something was left.
  it("subtracts what ANY run settled, not just the automatic one", () => {
    const a = holding("a", "wallet");
    const b = holding("b", "perps", { deterministic: false });
    expect(blockingHoldings([a, b], [ok("a"), ok("b")], 0)).toEqual([]);
    expect(blockingHoldings([a, b], [ok("a")], 0)).toEqual([b]);
  });

  it("keeps a holding every run failed on", () => {
    const a = holding("a", "wallet");
    expect(blockingHoldings([a], [failed("a"), failed("a")], 0)).toEqual([a]);
  });

  it("never blocks on what cannot move now", () => {
    const later = holding("l", "cpmm", {
      settleability: { state: "waitUntil", at: null, reason: "awaitingResolution" },
    });
    const now = holding("n", "wallet");
    expect(blockingHoldings([later, now], [], 0)).toEqual([now]);
  });

  it("is empty with nothing discovered", () => {
    expect(blockingHoldings([], [], 0)).toEqual([]);
  });

  // A sub-cent token that reverts on transfer must not hold the gate shut.
  it("blocks on a balance regardless of price, and not on a zero balance", () => {
    // Priced at $0 (feed down) but held — still blocks. No balance — never.
    const held = holding("h", "wallet", { amount: 1n, valueUsd: 0 });
    const empty = holding("e", "wallet", { amount: 0n, valueUsd: 5 });
    expect(blockingHoldings([held, empty], [], 0)).toEqual([held]);
    expect(blockingHoldings([empty], [], 0)).toEqual([]);
  });
});
