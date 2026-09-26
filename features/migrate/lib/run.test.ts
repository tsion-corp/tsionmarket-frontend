import { describe, expect, it, vi } from "vitest";
import { apiError } from "@/lib/api/envelope";
import { discoverHoldings } from "@/features/migrate/lib/discover";
import { runSettlement } from "@/features/migrate/lib/run";
import { scheduleSettlement } from "@/lib/migration/schedule";
import type {
  DiscoverContext,
  LegacyHolding,
  SettleContext,
  SettleOutcome,
  Venue,
  VenueAdapter,
} from "@/lib/migration/types";

function holding(
  venue: Venue,
  kind: string,
  overrides: Partial<LegacyHolding> = {}
): LegacyHolding {
  return {
    id: `${venue}:${kind}:${overrides.id ?? "x"}`,
    venue,
    kind,
    label: `${venue} ${kind}`,
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

const signer = {
  addresses: { evm: "0xOld", solana: null },
  sendBatch: vi.fn(),
  sendToken: vi.fn(),
  getEthereumProvider: vi.fn(),
  switchChain: vi.fn(async () => {}),
  sendTransaction: vi.fn(async () => "0x"),
};

function discoverCtx(hasLegacySession: boolean): DiscoverContext {
  return {
    legacy: { evm: "0xOld", solana: null },
    current: { evm: "0xNew", solana: "Sol" },
    hasLegacySession,
    signer: hasLegacySession ? signer : null,
    ethPriceUsd: 0,
  };
}

function settleCtx(signal = new AbortController().signal): SettleContext {
  return { ...discoverCtx(true), signer, signal, onProgress: () => {} };
}

function adapter(
  venue: Venue,
  discovered: LegacyHolding[],
  settle: VenueAdapter["settle"] = async (hs) =>
    new Map(hs.map((h) => [h.id, { ok: true, txHashes: ["0x1"] } as SettleOutcome])),
  requiresLegacySession = false
): VenueAdapter {
  return { venue, requiresLegacySession, discover: async () => discovered, settle };
}

describe("discoverHoldings", () => {
  it("merges every venue and isolates a failing one", async () => {
    const result = await discoverHoldings(
      [
        adapter("cashier", [holding("cashier", "available")]),
        {
          venue: "perps",
          requiresLegacySession: false,
          discover: async () => {
            throw new Error("boom");
          },
          settle: async () => new Map(),
        },
        adapter("wallet", [holding("wallet", "token")]),
      ],
      discoverCtx(true)
    );
    expect(result.holdings.map((h) => h.venue)).toEqual(["cashier", "wallet"]);
    expect(result.failures).toEqual([{ venue: "perps", error: "boom" }]);
  });

  it("keeps the HTTP status on a failure, so an expired session is told apart", async () => {
    const result = await discoverHoldings(
      [
        {
          venue: "wallet",
          requiresLegacySession: false,
          discover: async () => {
            throw apiError("UNAUTHORIZED", "sign in again", 401);
          },
          settle: async () => new Map(),
        },
      ],
      discoverCtx(true)
    );
    expect(result.failures).toEqual([{ venue: "wallet", error: "sign in again", status: 401 }]);
  });

  it("skips ledgers that need the old sign-in until it exists", async () => {
    const cashier = adapter("cashier", [holding("cashier", "available")], undefined, true);
    expect((await discoverHoldings([cashier], discoverCtx(false))).holdings).toEqual([]);
    expect((await discoverHoldings([cashier], discoverCtx(true))).holdings).toHaveLength(1);
  });
});

describe("runSettlement", () => {
  it("runs phases in order, re-discovers the wallet before the sweep, and reports complete", async () => {
    const order: string[] = [];
    const tracking =
      (venue: Venue): VenueAdapter["settle"] =>
      async (hs) => {
        order.push(venue);
        return new Map(hs.map((h) => [h.id, { ok: true, txHashes: [] } as SettleOutcome]));
      };
    const freshWallet = holding("wallet", "token", { id: "fresh", valueUsd: 40 });
    const adapters = [
      adapter("wallet", [freshWallet], tracking("wallet")),
      adapter("cashier", [], tracking("cashier")),
      adapter("perps", [], tracking("perps")),
    ];
    const plan = scheduleSettlement(
      [
        holding("wallet", "token", { id: "stale", valueUsd: 5 }),
        holding("perps", "position", { deterministic: false, irreversible: true }),
        holding("cashier", "available"),
      ],
      new Set(["perps:position:x"]),
      Date.now()
    );
    const irreversible = vi.fn();
    const result = await runSettlement(plan, adapters, settleCtx(), {
      onIrreversible: irreversible,
    });

    expect(order).toEqual(["cashier", "perps", "wallet"]);
    expect(irreversible).toHaveBeenCalledTimes(1);
    expect(result.plan.phases.at(-1)?.holdings).toEqual([freshWallet]);
    expect(result.results.get("wallet:token:stale")).toBeUndefined();
    expect(result.outcome).toBe("complete");
    expect(result.movedUsd).toBe(42);
  });

  it("marks a holding the adapter never answered for as not attempted, and the run partial", async () => {
    const a = holding("cashier", "available", { id: "a" });
    const b = holding("cashier", "available", { id: "b" });
    const adapters = [
      adapter("cashier", [], async (hs) => new Map([[hs[0].id, { ok: true, txHashes: [] }]])),
    ];
    const plan = scheduleSettlement([a, b], new Set(), Date.now());
    const result = await runSettlement(plan, adapters, settleCtx());

    expect(result.results.get(b.id)).toEqual({
      ok: false,
      error: "Not attempted.",
      retryable: true,
    });
    expect(result.outcome).toBe("partial");
    expect(result.movedUsd).toBe(1);
  });

  it("turns a throwing adapter into failed outcomes instead of aborting the run", async () => {
    const adapters = [
      adapter("cashier", [], async () => {
        throw new Error("cashier down");
      }),
      adapter("kash", []),
    ];
    const plan = scheduleSettlement(
      [holding("cashier", "available"), holding("kash", "token")],
      new Set(),
      Date.now()
    );
    const result = await runSettlement(plan, adapters, settleCtx());
    expect(result.results.get("cashier:available:x")).toMatchObject({
      ok: false,
      error: "cashier down",
    });
    expect(result.results.get("kash:token:x")).toMatchObject({ ok: true });
  });

  it("stops at the next venue once cancelled", async () => {
    const controller = new AbortController();
    const adapters = [
      adapter("cashier", [], async (hs) => {
        controller.abort();
        return new Map(hs.map((h) => [h.id, { ok: true, txHashes: [] } as SettleOutcome]));
      }),
      adapter("kash", []),
    ];
    const plan = scheduleSettlement(
      [holding("cashier", "available"), holding("kash", "token")],
      new Set(),
      Date.now()
    );
    const result = await runSettlement(plan, adapters, settleCtx(controller.signal));
    expect(result.results.get("kash:token:x")).toMatchObject({ ok: false, error: "Cancelled." });
  });
});
