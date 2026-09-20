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

  // The link that makes a bought memecoin visible: without this call the
  // allowlist only knows the public catalogue's first page, which on
  // 2026-09-15 was 67 Base coins out of a 121,383-token catalogue.
  it("asks the trade service which coins this caller holds", async () => {
    const seen = stubFetch();
    const { fetchPortfolio } = await import("./alchemy");
    await fetchPortfolio(WALLET, undefined, null, "Bearer privy-token");
    expect(seen.some((u) => u.includes("/portfolio?page=1"))).toBe(true);
  });

  // Signed out, or on a poll that carries no bearer, the trade service is not
  // called at all rather than called as nobody.
  it("asks nothing of the trade service without a bearer", async () => {
    const seen = stubFetch();
    const { fetchPortfolio } = await import("./alchemy");
    await fetchPortfolio(WALLET, undefined);
    expect(seen.some((u) => u.includes("/portfolio?page=1"))).toBe(false);
  });

  it("never calls the Portfolio API for an EVM wallet", async () => {
    const seen = stubFetch();
    const { fetchPortfolio } = await import("./alchemy");
    await fetchPortfolio(WALLET, undefined);
    expect(seen.some((u) => u.includes("assets/tokens/by-address"))).toBe(false);
    // Every EVM network was read, none of them through the Portfolio API.
    expect(seen.filter((u) => u.includes("rpc.zerodev.app")).length).toBe(EVM_NETWORKS.length);
  });

  it("reads only Base and skips Solana for the Base-only portfolio", async () => {
    const seen = stubFetch();
    const { fetchPortfolio } = await import("./alchemy");
    const SOLANA = "So1anaWa11etAddress111111111111111111111111";

    await fetchPortfolio(WALLET, SOLANA, null, null, "base");

    const chainReads = seen.filter((u) => u.includes("rpc.zerodev.app"));
    expect(chainReads).toHaveLength(1);
    expect(chainReads[0]).toContain("/chain/8453");
    expect(seen.some((u) => u.includes("assets/tokens/by-address"))).toBe(false);
  });

  // A trade on Base must not re-read the 27 other networks or re-page the
  // Solana Portfolio API: a scoped fresh read skips the snapshot cache and
  // re-reads only the networks in scope, everything else comes from cache.
  it("re-reads only the scoped network on a fresh read", async () => {
    const seen = stubFetch();
    const { fetchPortfolio } = await import("./alchemy");
    const SOLANA = "So1anaWa11etAddress111111111111111111111111";
    await fetchPortfolio(WALLET, SOLANA);
    const warm = seen.length;

    await fetchPortfolio(WALLET, SOLANA, ["base-mainnet"]);

    const since = seen.slice(warm);
    const chainReads = since.filter((u) => u.includes("rpc.zerodev.app"));
    expect(chainReads.length).toBe(1);
    expect(chainReads[0]).toContain("/chain/8453");
    expect(since.some((u) => u.includes("assets/tokens/by-address"))).toBe(false);
  });

  it("re-reads the Solana leg only when solana-mainnet is in scope", async () => {
    const seen = stubFetch();
    const { fetchPortfolio } = await import("./alchemy");
    const SOLANA = "So1anaWa11etAddress111111111111111111111111";
    await fetchPortfolio(WALLET, SOLANA);
    const warm = seen.length;

    await fetchPortfolio(WALLET, SOLANA, ["solana-mainnet"]);

    const since = seen.slice(warm);
    expect(since.filter((u) => u.includes("assets/tokens/by-address")).length).toBe(1);
    expect(since.some((u) => u.includes("rpc.zerodev.app"))).toBe(false);
  });

  it("still sweeps everything for the legacy fresh=1", async () => {
    const seen = stubFetch();
    const { fetchPortfolio } = await import("./alchemy");
    await fetchPortfolio(WALLET, undefined);
    const warm = seen.length;

    await fetchPortfolio(WALLET, undefined, "all");

    expect(seen.slice(warm).filter((u) => u.includes("rpc.zerodev.app")).length).toBe(
      EVM_NETWORKS.length
    );
  });

  // Seen on 2026-09-09: ZeroDev timed out on Base during a cold dashboard
  // render, Base missed the sweep's deadline, and the snapshot without the
  // wallet's USD was served from the 75 s cache. The balance read $1.96 for
  // a minute. A snapshot missing a network the wallet lives on says so and
  // is kept only long enough to answer the requests already in flight.
  it("marks a snapshot missing a hot network and re-reads it on the next request", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-09T10:08:00Z"));
    const seen = stubFetch();
    let baseHangs = true;
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
      const url =
        typeof input === "string" ? input : ((input as URL).href ?? (input as Request).url);
      seen.push(url);
      const ok = (body: unknown) =>
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      if (url.includes("rpc.zerodev.app")) {
        // Base answers, but only after the sweep's deadline has passed.
        const slow = baseHangs && url.endsWith("/chain/8453");
        const empty = encodeAbiParameters(
          [{ type: "tuple[]", components: [{ type: "bool" }, { type: "bytes" }] }],
          [[]]
        );
        const answer = ok([
          { jsonrpc: "2.0", id: 1, result: "0x0" },
          { jsonrpc: "2.0", id: 2, result: empty },
        ]);
        if (!slow) return answer;
        return new Promise<Response>((resolve) => setTimeout(() => resolve(answer), 15_000));
      }
      if (url.includes("/tokens/by-symbol")) return ok({ data: [] });
      return ok({});
    });
    const { fetchPortfolio } = await import("./alchemy");

    const pending = fetchPortfolio(WALLET, undefined);
    await vi.advanceTimersByTimeAsync(10_100);
    const partial = await pending;
    expect(partial.missing).toEqual(["base-mainnet"]);

    // Six seconds on: the floor has expired, the late Base answer has landed
    // in its own network cache, and the next request gets a whole snapshot.
    baseHangs = false;
    await vi.advanceTimersByTimeAsync(6_000);
    const pendingNext = fetchPortfolio(WALLET, undefined);
    await vi.advanceTimersByTimeAsync(100);
    const next = await pendingNext;
    expect(next.missing).toBeUndefined();
    expect(next).not.toBe(partial);
    vi.useRealTimers();
  });

  it("still calls the Portfolio API for a Solana wallet", async () => {
    const seen = stubFetch();
    const { fetchPortfolio } = await import("./alchemy");
    await fetchPortfolio(undefined, "So1anaWa11etAddress111111111111111111111111");
    expect(seen.filter((u) => u.includes("assets/tokens/by-address")).length).toBe(1);
    expect(seen.some((u) => u.includes("rpc.zerodev.app"))).toBe(false);
  });
});

// A held catalogue memecoin the market cannot price. The registry now says so
// with a null (null is not zero, per the trade contract), and that null must
// not leak into a TokenBalance, whose price is a number every consumer adds
// and sorts by. The holding stays a recognised meme with an unknown price,
// which the holdings list renders "Valuation unavailable", never "$0.00".
describe("fetchPortfolio, a held meme with no catalogue price", () => {
  const SOLANA = "So1anaWa11etAddress111111111111111111111111";
  const MINT = "Mem3M1ntCaseSensitive11111111111111111111111";

  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("ALCHEMY_API_KEY", "alchemy-key");
    vi.doMock("@/lib/server/rwa-registry", () => ({ fetchRwaRegistry: async () => ({}) }));
    vi.doMock("@/lib/server/buyable-registry", () => ({
      fetchBuyableRegistry: async () => ({
        buyable: { "solana-mainnet": new Set([MINT.toLowerCase()]) },
        meme: { "solana-mainnet": new Map([[MINT.toLowerCase(), { logo: null, priceUsd: null }]]) },
      }),
    }));
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url =
          typeof input === "string" ? input : ((input as URL).href ?? (input as Request).url);
        const ok = (body: unknown) =>
          new Response(JSON.stringify(body), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        if (url.includes("assets/tokens/by-address")) {
          return ok({
            data: {
              tokens: [
                {
                  network: "solana-mainnet",
                  tokenAddress: MINT,
                  tokenBalance: "5000000",
                  tokenMetadata: { decimals: 6, symbol: "MEME", name: "Meme" },
                  tokenPrices: [],
                },
              ],
            },
          });
        }
        if (url.includes("/tokens/by-symbol")) return ok({ data: [] });
        return ok({});
      })
    );
  });
  afterEach(async () => {
    const { resetResponseCache } = await import("./response-cache");
    resetResponseCache();
    vi.doUnmock("@/lib/server/rwa-registry");
    vi.doUnmock("@/lib/server/buyable-registry");
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("keeps the holding, marked a meme, with an unknown price rather than a null one", async () => {
    const { fetchPortfolio } = await import("./alchemy");
    const { tokens } = await fetchPortfolio(undefined, SOLANA);
    const meme = tokens.find((t) => t.address === MINT);
    expect(meme).toBeDefined();
    expect(meme?.meme).toBe(true);
    expect(meme?.balance).toBe(5);
    expect(meme?.priceUsd).toBe(0);
    expect(meme?.valueUsd).toBe(0);
  });
});

// A wallet with both chains lost its EVM balances silently: the Solana leg
// answered, so the snapshot looked complete, and a complete snapshot is
// cached and never re-read. The EVM networks have to be reported as missing.
describe("fetchPortfolio when the chain read fails", () => {
  const WALLET = "0x1111111111111111111111111111111111111111";
  const SOLANA = "So1anaWa11etAddress111111111111111111111111";

  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("ALCHEMY_API_KEY", "alchemy-key");
    vi.doMock("@/lib/server/rwa-registry", () => ({ fetchRwaRegistry: async () => ({}) }));
    vi.doMock("@/lib/server/buyable-registry", () => ({
      fetchBuyableRegistry: async () => ({ buyable: {}, meme: {} }),
    }));
    vi.doMock("@/lib/server/portfolio-holdings", async () => {
      const actual = await vi.importActual<typeof import("@/lib/server/portfolio-holdings")>(
        "@/lib/server/portfolio-holdings"
      );
      return {
        ...actual,
        readEvmPortfolioTokens: vi.fn(async () => {
          throw new Error("read pool unavailable");
        }),
      };
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ data: { tokens: [] } }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
      )
    );
  });
  afterEach(async () => {
    const { resetResponseCache } = await import("./response-cache");
    resetResponseCache();
    vi.doUnmock("@/lib/server/portfolio-holdings");
    vi.doUnmock("@/lib/server/rwa-registry");
    vi.doUnmock("@/lib/server/buyable-registry");
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("reports the EVM networks as missing rather than as a complete snapshot", async () => {
    const { fetchPortfolio } = await import("./alchemy");
    const portfolio = await fetchPortfolio(WALLET, SOLANA);
    expect(portfolio.missing).toEqual(expect.arrayContaining(["base-mainnet"]));
  });

  it("still fails outright when the wallet has no other chain to fall back on", async () => {
    const { fetchPortfolio } = await import("./alchemy");
    await expect(fetchPortfolio(WALLET, undefined)).rejects.toThrow();
  });
});
