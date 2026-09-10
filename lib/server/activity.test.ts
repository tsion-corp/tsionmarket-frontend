import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildActivityEntries, isStable } from "@/lib/activity/entries";
import type { ActivityItem } from "@/lib/server/activity";

function transfer(over: Partial<ActivityItem> & Pick<ActivityItem, "symbol" | "direction">) {
  return {
    id: `${over.hash ?? "0xabc"}:${over.symbol}:${over.direction}`,
    hash: "0xabc",
    network: "solana-mainnet",
    amount: 1,
    timestamp: 1_000,
    counterparty: null,
    logo: null,
    ...over,
  } as ActivityItem;
}

describe("buildActivityEntries", () => {
  it("reads a purchase as one action, not two transfers", () => {
    // The real GLDx buy: USDC out and GLDx in, same signature.
    const entries = buildActivityEntries([
      transfer({ symbol: "USDC", direction: "out", amount: 2.876564 }),
      transfer({ symbol: "GLDx", direction: "in", amount: 0.007744 }),
    ]);
    expect(entries).toHaveLength(1);
    expect(entries[0].kind).toBe("bought");
    // Named by what you got, priced by what it cost.
    expect(entries[0].symbol).toBe("GLDx");
    expect(entries[0].amount).toBe(0.007744);
    expect(entries[0].direction).toBe("in");
    expect(entries[0].counterSymbol).toBe("USDC");
    expect(entries[0].counterAmount).toBe(2.876564);
  });

  it("reads the reverse as a sale, named by what was given up", () => {
    const entries = buildActivityEntries([
      transfer({ symbol: "GLDx", direction: "out", amount: 0.007744 }),
      transfer({ symbol: "USDC", direction: "in", amount: 2.875896 }),
    ]);
    expect(entries[0].kind).toBe("sold");
    expect(entries[0].symbol).toBe("GLDx");
    expect(entries[0].direction).toBe("out");
    expect(entries[0].counterSymbol).toBe("USDC");
  });

  it("calls it a swap when no side is money", () => {
    const entries = buildActivityEntries([
      transfer({ symbol: "ETH", direction: "out" }),
      transfer({ symbol: "GLDx", direction: "in" }),
    ]);
    expect(entries[0].kind).toBe("swapped");
  });

  it("names a lone stablecoin movement a deposit or a withdrawal", () => {
    expect(buildActivityEntries([transfer({ symbol: "USDC", direction: "in" })])[0].kind).toBe(
      "deposited"
    );
    expect(buildActivityEntries([transfer({ symbol: "USDC", direction: "out" })])[0].kind).toBe(
      "withdrew"
    );
  });

  it("keeps received and sent for everything else", () => {
    expect(buildActivityEntries([transfer({ symbol: "SOL", direction: "in" })])[0].kind).toBe(
      "received"
    );
    expect(buildActivityEntries([transfer({ symbol: "SOL", direction: "out" })])[0].kind).toBe(
      "sent"
    );
  });

  it("reads money out on one chain and an asset in on another as one purchase", () => {
    // A shared hash across chains never merges by itself (grouping is per
    // network:hash), but money leaving Base while an asset arrives on Solana
    // moments later is one cross-chain purchase, and reads as one.
    const entries = buildActivityEntries([
      transfer({ symbol: "USDC", direction: "out", network: "base-mainnet" }),
      transfer({ symbol: "GLDx", direction: "in", network: "solana-mainnet" }),
    ]);
    expect(entries).toHaveLength(1);
    expect(entries[0].kind).toBe("bought");
    expect(entries[0].symbol).toBe("GLDx");
    expect(entries[0].counterSymbol).toBe("USDC");
  });

  it("does not read a same-asset in-and-out as a trade", () => {
    // A routed hop can touch the wallet twice in the same asset; that is a
    // movement, not a purchase of USDC with USDC.
    const entries = buildActivityEntries([
      transfer({ symbol: "USDC", direction: "out", amount: 5 }),
      transfer({ symbol: "USDC", direction: "in", amount: 4.9 }),
    ]);
    expect(entries).toHaveLength(2);
    expect(entries.every((e) => e.kind === "withdrew" || e.kind === "deposited")).toBe(true);
  });

  it("picks the largest leg when a swap routes through several hops", () => {
    const entries = buildActivityEntries([
      transfer({ symbol: "USDC", direction: "out", amount: 0.01 }),
      transfer({ symbol: "USDC", direction: "out", amount: 2.88 }),
      transfer({ symbol: "GLDx", direction: "in", amount: 0.0077 }),
    ]);
    expect(entries).toHaveLength(1);
    expect(entries[0].counterAmount).toBe(2.88);
  });

  it("carries the traded asset's own logo, not the money's", () => {
    // The row renders this; without it GLDx and PRCL showed no icon at all.
    const entries = buildActivityEntries([
      transfer({ symbol: "USDC", direction: "out", amount: 2.88, logo: null }),
      transfer({
        symbol: "GLDx",
        direction: "in",
        amount: 0.0077,
        logo: "/api/token-logo/solana/Xsv9",
      }),
    ]);
    expect(entries[0].logo).toBe("/api/token-logo/solana/Xsv9");
  });

  it("orders newest first", () => {
    const entries = buildActivityEntries([
      transfer({ symbol: "SOL", direction: "in", hash: "0x1", timestamp: 1 }),
      transfer({ symbol: "SOL", direction: "in", hash: "0x2", timestamp: 9 }),
    ]);
    expect(entries[0].timestamp).toBe(9);
  });
});

describe("dust", () => {
  it("drops a stablecoin movement worth less than a cent", () => {
    // The refund a Dextopus settlement hands back after a withdrawal: real,
    // and worthless, and it read as "Deposited USDC +0" in the feed and the
    // bell after every single withdrawal.
    const entries = buildActivityEntries([
      transfer({ hash: "0x1", symbol: "USDC", direction: "out", amount: 20 }),
      transfer({ hash: "0x2", symbol: "USDC", direction: "in", amount: 0.00003 }),
      transfer({ hash: "0x3", symbol: "USDC", direction: "in", amount: 0.0001 }),
    ]);
    expect(entries.map((e) => [e.kind, e.amount])).toEqual([["withdrew", 20]]);
  });

  it("keeps a cent, and keeps small amounts of anything that is not money", () => {
    const entries = buildActivityEntries([
      transfer({ hash: "0x1", symbol: "USDC", direction: "in", amount: 0.01 }),
      transfer({ hash: "0x2", symbol: "SOL", direction: "in", amount: 0.000001 }),
    ]);
    expect(entries.map((e) => e.kind).sort()).toEqual(["deposited", "received"]);
  });

  it("does not break a trade apart over a dust leg", () => {
    // A buy's own transaction can carry a rounding remainder of USDC back in;
    // the trade still reads as one buy.
    const entries = buildActivityEntries([
      transfer({ hash: "0x9", symbol: "USDC", direction: "out", amount: 50 }),
      transfer({ hash: "0x9", symbol: "GLDx", direction: "in", amount: 0.5 }),
      transfer({ hash: "0x9", symbol: "USDC", direction: "in", amount: 0.000001 }),
    ]);
    expect(entries).toHaveLength(1);
    expect(entries[0].kind).toBe("bought");
  });
});

describe("isStable", () => {
  it("treats the money assets as money, case-insensitively", () => {
    expect(isStable("usdc")).toBe(true);
    expect(isStable("USDT")).toBe(true);
    expect(isStable("GLDx")).toBe(false);
    expect(isStable("SOL")).toBe(false);
  });
});

describe("cross-chain moves are not withdrawals", () => {
  it("names a transfer into the bridge router a move", () => {
    // The two 1:35/1:36 AM legs that funded a Solana purchase read as
    // "Withdrew USDC to 0x1231…4eae", as if the money had left the platform.
    const entries = buildActivityEntries([
      transfer({
        symbol: "USDC",
        direction: "out",
        network: "base-mainnet",
        amount: 3.06,
        counterparty: "0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae",
      }),
    ]);
    expect(entries[0].kind).toBe("moved");
  });

  it("matches the router regardless of address casing", () => {
    const entries = buildActivityEntries([
      transfer({
        symbol: "USDC",
        direction: "out",
        network: "base-mainnet",
        counterparty: "0x1231DEB6F5749EF6CE6943A275A1D3E7486F4EAE",
      }),
    ]);
    expect(entries[0].kind).toBe("moved");
  });

  it("still calls a real external send a withdrawal", () => {
    const entries = buildActivityEntries([
      transfer({
        symbol: "USDC",
        direction: "out",
        network: "base-mainnet",
        counterparty: "0xf70da978aaa61c7a4c48f0e0b0f0b6b9a4b1c2d3",
      }),
    ]);
    expect(entries[0].kind).toBe("withdrew");
  });
});

// The sweep itself. Every upstream is stubbed, so these cases are about one
// thing: what the reader reports when an upstream does not answer. The bug
// they lock down is a total Alchemy outage reading as "you have no history".
vi.mock("@/lib/server/alchemy-keys", () => ({
  alchemyFetch: (buildUrl: (key: string) => string, init?: RequestInit) =>
    alchemyStub(buildUrl, init),
}));
vi.mock("@/lib/server/rwa-registry", () => ({ fetchRwaRegistry: () => rwaStub() }));
vi.mock("@/lib/server/buyable-registry", () => ({ fetchBuyableRegistry: () => buyableStub() }));
vi.mock("@/lib/server/action-registry", () => ({
  fetchActionRegistry: () => actionStub(),
  actionFor: () => undefined,
}));

const alchemyStub =
  vi.fn<(buildUrl: (key: string) => string, init?: RequestInit) => Promise<Response>>();
const rwaStub = vi.fn(async () => ({}));
const buyableStub = vi.fn(async () => ({ buyable: {}, meme: {} }));
const actionStub = vi.fn(async () => ({}));

const WALLET = "0x7bd20000000000000000000000000000000043ba";

// The network a stubbed call is for, read off the URL the caller built.
function networkOf(buildUrl: (key: string) => string): string {
  return new URL(buildUrl("test-key")).host.split(".")[0];
}

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

// One inbound native ETH transfer, the shape Alchemy returns it in.
function transfersFor(network: string) {
  return jsonResponse({
    jsonrpc: "2.0",
    id: 1,
    result: {
      transfers: [
        {
          uniqueId: `0x${network}:external:0`,
          hash: `0x${network}`,
          from: "0x1111111111111111111111111111111111111111",
          to: WALLET,
          value: 1.5,
          asset: "ETH",
          category: "external",
          metadata: { blockTimestamp: "2026-09-01T00:00:00.000Z" },
        },
      ],
    },
  });
}

describe("fetchActivity", () => {
  beforeEach(async () => {
    const { resetResponseCache } = await import("@/lib/server/response-cache");
    resetResponseCache();
    vi.clearAllMocks();
    rwaStub.mockResolvedValue({});
    buyableStub.mockResolvedValue({ buyable: {}, meme: {} });
    actionStub.mockResolvedValue({});
  });

  it("refuses to report an empty history when every network read failed", async () => {
    // The local symptom: both Alchemy keys answer 429, every per-network catch
    // turns that into [], and the view says "Nothing here yet" about a wallet
    // that has plenty. Nothing could be read, so nothing may be claimed.
    alchemyStub.mockRejectedValue(new Error("Alchemy request failed: 429"));

    const { fetchActivity } = await import("@/lib/server/activity");
    await expect(fetchActivity(WALLET)).rejects.toThrow(/could not be read/i);
  });

  it("names the exhausted key pool so the route can answer 429, not 502", async () => {
    alchemyStub.mockRejectedValue(new Error("Alchemy request failed: 429"));

    const { fetchActivity, isActivityRateLimited } = await import("@/lib/server/activity");
    const error = await fetchActivity(WALLET).catch((e: unknown) => e);
    expect(isActivityRateLimited(error)).toBe(true);
  });

  it("reports a genuinely empty history as empty, with nothing unavailable", async () => {
    alchemyStub.mockImplementation(async () =>
      jsonResponse({ jsonrpc: "2.0", id: 1, result: { transfers: [] } })
    );

    const { fetchActivity } = await import("@/lib/server/activity");
    const read = await fetchActivity(WALLET);
    expect(read.items).toEqual([]);
    expect(read.unavailable).toEqual([]);
  });

  it("keeps the networks that answered when only some fail, and names the rest", async () => {
    // Proportionality: one chain being down must not blank a page that has
    // good rows from four others.
    alchemyStub.mockImplementation(async (buildUrl) => {
      const network = networkOf(buildUrl);
      if (network === "eth-mainnet") throw new Error("Alchemy request failed: 500");
      return transfersFor(network);
    });

    const { fetchActivity } = await import("@/lib/server/activity");
    const read = await fetchActivity(WALLET);
    expect(read.items.length).toBeGreaterThan(0);
    expect(read.items.some((i) => i.network === "eth-mainnet")).toBe(false);
    expect(read.unavailable).toContain("eth-mainnet");
  });

  it("flags the read as partial when a registry could not be loaded", async () => {
    // An empty RWA registry silently drops every RWA row from the feed, so a
    // list built without it is incomplete, not complete.
    alchemyStub.mockImplementation(async () =>
      jsonResponse({ jsonrpc: "2.0", id: 1, result: { transfers: [] } })
    );
    rwaStub.mockRejectedValue(new Error("registry down"));

    const { fetchActivity } = await import("@/lib/server/activity");
    const read = await fetchActivity(WALLET);
    expect(read.unavailable).toContain("rwa-registry");
  });

  it("treats a JSON-RPC error body as a failure, not as an empty result", async () => {
    // Alchemy can answer HTTP 200 with an error object. Reading `result` off
    // that gives undefined, which used to read as "no transfers".
    alchemyStub.mockImplementation(async () =>
      jsonResponse({ jsonrpc: "2.0", id: 1, error: { code: -32000, message: "capacity" } })
    );

    const { fetchActivity } = await import("@/lib/server/activity");
    await expect(fetchActivity(WALLET)).rejects.toThrow(/could not be read/i);
  });

  it("asks nothing and reports nothing unavailable when no wallet is given", async () => {
    const { fetchActivity } = await import("@/lib/server/activity");
    const read = await fetchActivity(undefined, undefined);
    expect(read).toEqual({ items: [], unavailable: [] });
    expect(alchemyStub).not.toHaveBeenCalled();
  });
});

// One sweep is the most expensive read in the app and history changes only
// when a transaction lands. The bell asks every 10 min; a snapshot served
// for 5 min means at most one sweep per poll, never one per tab.
describe("fetchActivity snapshot window", () => {
  beforeEach(async () => {
    const { resetResponseCache } = await import("@/lib/server/response-cache");
    resetResponseCache();
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-09T12:00:00Z"));
    rwaStub.mockResolvedValue({});
    buyableStub.mockResolvedValue({ buyable: {}, meme: {} });
    actionStub.mockResolvedValue({});
    alchemyStub.mockImplementation(async () =>
      jsonResponse({ jsonrpc: "2.0", id: 1, result: { transfers: [] } })
    );
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("serves a wallet's history from one sweep for five minutes", async () => {
    const { fetchActivity } = await import("@/lib/server/activity");
    const wallet = "0x1111111111111111111111111111111111111111";
    await fetchActivity(wallet, undefined);
    const sweep = alchemyStub.mock.calls.length;
    expect(sweep).toBeGreaterThan(0);

    vi.advanceTimersByTime(4 * 60_000);
    await fetchActivity(wallet, undefined);
    expect(alchemyStub).toHaveBeenCalledTimes(sweep);

    vi.advanceTimersByTime(2 * 60_000);
    await fetchActivity(wallet, undefined);
    expect(alchemyStub).toHaveBeenCalledTimes(sweep * 2);
  });
});
