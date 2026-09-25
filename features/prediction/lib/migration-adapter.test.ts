import { describe, expect, it } from "vitest";
import {
  classifyCpmm,
  classifyPolymarket,
  type CpmmInput,
} from "@/features/prediction/lib/migration-adapter";
import type { LegacyRedeemable } from "@/features/prediction/lib/legacy-claim";
import type { Market } from "@/features/prediction/lib/types";

const NOW = 1_700_000_000;
const CONTRACT = "0x1234567890123456789012345678901234567890";
process.env.NEXT_PUBLIC_PREDICTION_CONTRACT_ADDRESS ??= CONTRACT;

function market(overrides: Partial<Market>): Market {
  return {
    marketId: 1n,
    creator: "0xCreator",
    question: "Will it rain?",
    category: null,
    imageUrl: null,
    description: null,
    rules: null,
    resolutionSource: null,
    status: "Open",
    outcome: "Unresolved",
    closeTime: NOW + 3600,
    feeBps: 100,
    priceYes: 600_000n,
    priceNo: 400_000n,
    rYes: 1_000_000_000n,
    rNo: 1_000_000_000n,
    totalLp: 2_000_000_000n,
    collateral: 2_000_000_000n,
    volumeUsdc: 0n,
    ...overrides,
  };
}

function input(overrides: Partial<CpmmInput>): CpmmInput {
  return {
    markets: [],
    positions: [],
    lpPositions: [],
    redeemableAt: new Map(),
    pendingWithdrawals: 0n,
    legacy: { redeemables: [], pending: 0n },
    nowSeconds: NOW,
    ...overrides,
  };
}

describe("classifyCpmm", () => {
  it("claims credited payouts without asking", () => {
    const [h] = classifyCpmm(input({ pendingWithdrawals: 5_000_000n }));
    expect(h.id).toBe("cpmm:claim:pending");
    expect(h.deterministic).toBe(true);
    expect(h.valueUsd).toBe(5);
    expect(h.settleability).toEqual({ state: "now" });
  });

  it("redeems a winner once the challenge window has passed, waits before", () => {
    const resolved = market({ status: "Resolved", outcome: "Yes" });
    const position = { marketId: 1n, side: "yes" as const, shares: 3_000_000n, costUsdc: 0n };

    const [open] = classifyCpmm(
      input({ markets: [resolved], positions: [position], redeemableAt: new Map([["1", NOW - 1]]) })
    );
    expect(open.kind).toBe("redeem");
    expect(open.settleability).toEqual({ state: "now" });
    expect(open.valueUsd).toBe(3);

    const [waiting] = classifyCpmm(
      input({
        markets: [resolved],
        positions: [position],
        redeemableAt: new Map([["1", NOW + 60]]),
      })
    );
    expect(waiting.settleability).toEqual({
      state: "waitUntil",
      at: (NOW + 60) * 1000,
      reason: "challengeWindow",
    });
  });

  it("drops the losing side of a resolved market", () => {
    const resolved = market({ status: "Resolved", outcome: "Yes" });
    const holdings = classifyCpmm(
      input({
        markets: [resolved],
        positions: [{ marketId: 1n, side: "no", shares: 3_000_000n, costUsdc: 0n }],
      })
    );
    expect(holdings).toEqual([]);
  });

  it("prices open shares at the pool and marks them opt-in", () => {
    const [h] = classifyCpmm(
      input({
        markets: [market({})],
        positions: [{ marketId: 1n, side: "yes", shares: 10_000_000n, costUsdc: 0n }],
      })
    );
    expect(h.kind).toBe("shares");
    expect(h.valueUsd).toBe(6);
    expect(h.deterministic).toBe(false);
    expect(h.irreversible).toBe(true);
    expect(h.settleability).toEqual({ state: "now" });
  });

  it("parks shares in a closed, unresolved market and strands an invalid one", () => {
    const position = { marketId: 1n, side: "yes" as const, shares: 1_000_000n, costUsdc: 0n };
    const [closed] = classifyCpmm(
      input({ markets: [market({ status: "Closed" })], positions: [position] })
    );
    expect(closed.settleability).toEqual({
      state: "waitUntil",
      at: null,
      reason: "awaitingResolution",
    });

    const [invalid] = classifyCpmm(
      input({ markets: [market({ status: "Invalid" })], positions: [position] })
    );
    expect(invalid.settleability).toEqual({ state: "stranded", reason: "invalidMarket" });
  });

  it("returns resolved LP automatically and makes open LP opt-in", () => {
    const lp = { marketId: 1n, lpShares: 1_000_000_000n };
    const [returned] = classifyCpmm(
      input({ markets: [market({ status: "Resolved", outcome: "No" })], lpPositions: [lp] })
    );
    expect(returned.kind).toBe("lp");
    expect(returned.amount).toBe(1_000_000_000n);
    expect(returned.deterministic).toBe(true);
    expect(returned.ref).toMatchObject({ kind: "lp", winning: "no" });

    const [open] = classifyCpmm(input({ markets: [market({})], lpPositions: [lp] }));
    expect(open.deterministic).toBe(false);
    expect(open.irreversible).toBe(true);
  });

  it("claims solvent legacy positions together and strands insolvent ones", () => {
    const solvent: LegacyRedeemable = {
      marketId: 9n,
      side: 0,
      shares: 2_000_000n,
      label: "Old market",
      kind: "winning",
      solvent: true,
    };
    const insolvent: LegacyRedeemable = {
      ...solvent,
      marketId: 10n,
      label: "Broken market",
      solvent: false,
    };
    const holdings = classifyCpmm(
      input({ legacy: { redeemables: [solvent, insolvent], pending: 500_000n } })
    );
    expect(holdings.map((h) => [h.id, h.settleability.state, h.amount])).toEqual([
      ["cpmm:legacy:claim", "now", 2_500_000n],
      ["cpmm:legacy:10:0", "stranded", 2_000_000n],
    ]);
  });
});

describe("classifyPolymarket", () => {
  it("redeems winners once per condition, sells open positions opt-in, settles collateral", () => {
    const holdings = classifyPolymarket({
      positions: [
        {
          title: "A",
          outcome: "Yes",
          size: 10,
          curPrice: 1,
          currentValue: 10,
          redeemable: true,
          conditionId: "c1",
          tokenId: "t1",
        },
        {
          title: "A",
          outcome: "No",
          size: 4,
          curPrice: 0,
          currentValue: 0,
          redeemable: true,
          conditionId: "c1",
          tokenId: "t2",
        },
        {
          title: "B",
          outcome: "Yes",
          size: 5,
          curPrice: 0.4,
          currentValue: 2,
          redeemable: false,
          conditionId: "c2",
          tokenId: "t3",
        },
      ],
      collateralUsd: 12.5,
      unsettledUsdcUsd: 0.5,
    });

    expect(holdings.map((h) => [h.id, h.deterministic, h.valueUsd])).toEqual([
      ["polymarket:redeem:c1", true, 10],
      ["polymarket:shares:t3", false, 2],
      ["polymarket:collateral:polygon", true, 13],
    ]);
    expect(holdings[2].amount).toBe(13_000_000n);
  });

  it("is empty with no positions and no collateral", () => {
    expect(classifyPolymarket({ positions: [], collateralUsd: 0, unsettledUsdcUsd: 0 })).toEqual(
      []
    );
  });
});
