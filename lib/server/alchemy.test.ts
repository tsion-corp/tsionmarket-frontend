import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  EVM_NETWORKS,
  NATIVE_PRICE_SYMBOLS,
  PRICE_SYMBOLS_PER_REQUEST,
  allowedContracts,
  isAllowedHolding,
} from "@/lib/server/alchemy";
import { CONTRACTS } from "@/lib/polymarket/config";
import { encodeAbiParameters } from "viem";

const emptyRwa = {};
const emptyBuyable = {};

describe("isAllowedHolding, newly added chains", () => {
  it("allows native BNB on bnb-mainnet, the chain the holdings bug was reported on", () => {
    expect(isAllowedHolding("bnb-mainnet", null, true, emptyRwa, emptyBuyable)).toBe(true);
  });

  it("allows every network's native gas token, since EVM_NETWORKS and NATIVE_TOKEN must stay in sync", () => {
    for (const network of EVM_NETWORKS) {
      if (network === "mythos-mainnet") continue; // no verified native-token data, see alchemy.ts
      expect(isAllowedHolding(network, null, true, emptyRwa, emptyBuyable)).toBe(true);
    }
  });

  it("still rejects a native balance on a chain we don't track", () => {
    expect(isAllowedHolding("fantom-mainnet", null, true, emptyRwa, emptyBuyable)).toBe(false);
  });

  it("mythos-mainnet has no verified native-token data, so its native balance stays out", () => {
    expect(isAllowedHolding("mythos-mainnet", null, true, emptyRwa, emptyBuyable)).toBe(false);
  });

  it("recognizes a token bought on a new chain via the buyable registry, same as the original chains", () => {
    const buyable = { "bnb-mainnet": new Set(["0x1234567890123456789012345678901234567890"]) };
    expect(
      isAllowedHolding(
        "bnb-mainnet",
        "0x1234567890123456789012345678901234567890",
        false,
        emptyRwa,
        buyable
      )
    ).toBe(true);
  });

  it("still rejects an unrecognized token on a new chain (no allowlist bypass)", () => {
    expect(
      isAllowedHolding(
        "bnb-mainnet",
        "0x0000000000000000000000000000000000dead",
        false,
        emptyRwa,
        emptyBuyable
      )
    ).toBe(false);
  });

  it("keeps Polygon pUSD visible even when it is not in the buyable catalog", () => {
    expect(isAllowedHolding("polygon-mainnet", CONTRACTS.pusd, false, emptyRwa, emptyBuyable)).toBe(
      true
    );
  });
});

// Two users had a buy delivered on a chain the portfolio reads (APE on
// ApeChain, HYPE on HyperEVM) and saw nothing in holdings. The allowlist was
// not the problem — these assert the layer that was: the Portfolio API returns
// no price for those natives, so the by-symbol backfill has to cover every
// chain we track, or the holding is valued at $0 and hidden by default.
describe("NATIVE_PRICE_SYMBOLS", () => {
  it("covers the native symbol of every chain we resolve a native balance on", () => {
    for (const symbol of ["ETH", "POL", "SOL", "APE", "HYPE", "BNB", "BERA", "CELO", "AVAX"]) {
      expect(NATIVE_PRICE_SYMBOLS).toContain(symbol);
    }
  });

  it("stays inside the price endpoint's 25-symbol per-request cap", () => {
    expect(NATIVE_PRICE_SYMBOLS.length).toBeLessThanOrEqual(PRICE_SYMBOLS_PER_REQUEST);
  });

  it("carries no duplicates, so the cache key is stable", () => {
    expect(new Set(NATIVE_PRICE_SYMBOLS).size).toBe(NATIVE_PRICE_SYMBOLS.length);
  });
});

describe("allowedContracts", () => {
  it("names the tracked stables, the extras, Polymarket collateral and both registries, lowercased and deduplicated", () => {
    const rwa = {
      "base-mainnet": new Map([
        ["0xAAAA000000000000000000000000000000000001", { symbol: "T", priceUsd: 1, logo: "" }],
      ]),
    };
    const buyable = {
      "base-mainnet": new Set([
        "0xaaaa000000000000000000000000000000000001",
        "0xbbbb000000000000000000000000000000000002",
      ]),
    };
    const base = allowedContracts("base-mainnet", rwa, buyable);
    expect(base).toContain("0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"); // USDC
    expect(base).toContain("0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf"); // cbBTC
    expect(base).toContain("0xaaaa000000000000000000000000000000000001");
    expect(base).toContain("0xbbbb000000000000000000000000000000000002");
    expect(new Set(base).size).toBe(base.length);
    expect(allowedContracts("polygon-mainnet", {}, {})).toContain(CONTRACTS.pusd.toLowerCase());
    expect(allowedContracts("zora-mainnet", {}, {})).toEqual([]);
  });
});

// The Portfolio API costs 360 CU per request and pages through every spam
// token a wallet ever received, to be filtered down to an allowlist we
// already know. EVM balances now come from the chain through the read pool;
// Solana keeps the Portfolio API until its own change.
describe("fetchPortfolio upstreams", () => {
  const WALLET = "0x1111111111111111111111111111111111111111";
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("ZERODEV_PROJECT_ID", "test-project-id-123");
    vi.stubEnv("ALCHEMY_API_KEY", "alchemy-key");
    vi.doMock("@/lib/server/rwa-registry", () => ({ fetchRwaRegistry: async () => ({}) }));
    vi.doMock("@/lib/server/buyable-registry", () => ({
      fetchBuyableRegistry: async () => ({ buyable: {}, meme: {} }),
    }));
  });
  afterEach(async () => {
    const { resetResponseCache } = await import("./response-cache");
    resetResponseCache();
    vi.doUnmock("@/lib/server/rwa-registry");
    vi.doUnmock("@/lib/server/buyable-registry");
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  function stubFetch() {
    const seen: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url =
          typeof input === "string" ? input : ((input as URL).href ?? (input as Request).url);
        seen.push(url);
        const ok = (body: unknown) =>
          new Response(JSON.stringify(body), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        if (url.includes("rpc.zerodev.app")) {
          // Both calls of a holdings batch: native balance and an empty
          // aggregate3 answer, so networks with contracts take the real path.
          const empty = encodeAbiParameters(
            [{ type: "tuple[]", components: [{ type: "bool" }, { type: "bytes" }] }],
            [[]]
          );
          return ok([
            { jsonrpc: "2.0", id: 1, result: "0x0" },
            { jsonrpc: "2.0", id: 2, result: empty },
          ]);
        }
        if (url.includes("/tokens/by-symbol")) return ok({ data: [] });
        if (url.includes("assets/tokens/by-address")) return ok({ data: { tokens: [] } });
        return ok({});
      })
    );
    return seen;
  }

  it("never calls the Portfolio API for an EVM wallet", async () => {
    const seen = stubFetch();
    const { fetchPortfolio } = await import("./alchemy");
    await fetchPortfolio(WALLET, undefined);
    expect(seen.some((u) => u.includes("assets/tokens/by-address"))).toBe(false);
    // Every EVM network was read, none of them through the Portfolio API.
    expect(seen.filter((u) => u.includes("rpc.zerodev.app")).length).toBe(EVM_NETWORKS.length);
  });

  it("still calls the Portfolio API for a Solana wallet", async () => {
    const seen = stubFetch();
    const { fetchPortfolio } = await import("./alchemy");
    await fetchPortfolio(undefined, "So1anaWa11etAddress111111111111111111111111");
    expect(seen.filter((u) => u.includes("assets/tokens/by-address")).length).toBe(1);
    expect(seen.some((u) => u.includes("rpc.zerodev.app"))).toBe(false);
  });
});
