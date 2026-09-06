import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const upstream = vi.hoisted(() => ({
  fetchPrices: vi.fn(),
  dextopusRequest: vi.fn(),
  forwardEvmRpcRead: vi.fn(),
  fetchMarketTokens: vi.fn(),
  fetchRwaMarket: vi.fn(),
  wsapiPerpRequest: vi.fn(),
  wsapiRwaRequest: vi.fn(),
  readActiveGamesWith: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock("@/lib/server/alchemy", () => ({ fetchPrices: upstream.fetchPrices }));
vi.mock("@/lib/server/dextopus", () => ({ dextopusRequest: upstream.dextopusRequest }));
vi.mock("@/lib/server/evm-rpc", () => ({ forwardEvmRpcRead: upstream.forwardEvmRpcRead }));
vi.mock("@/lib/server/market-tokens", () => ({ fetchMarketTokens: upstream.fetchMarketTokens }));
vi.mock("@/lib/server/rwa-prices", () => ({ fetchRwaMarket: upstream.fetchRwaMarket }));
vi.mock("@/lib/server/wsapi", () => ({
  wsapiPerpRequest: upstream.wsapiPerpRequest,
  wsapiRwaRequest: upstream.wsapiRwaRequest,
}));
vi.mock("@/lib/vault/read", () => ({ readActiveGamesWith: upstream.readActiveGamesWith }));
vi.mock("@/lib/server/upstreams", () => ({
  TRADE_BASE: "https://trade.test",
  VAULT_BASE: "https://vault.test",
  CHESS_BASE: "https://chess.test",
}));
vi.mock("@/lib/trade/sponsored-evm", () => ({
  getSponsoredEvmChainByNetwork: () => ({ chainId: 8453, network: "base-mainnet" }),
}));

import { buildDashboardFeed } from "@/lib/server/dashboard-feed";
import { resetResponseCache } from "@/lib/server/response-cache";

function ok(data: unknown): Response {
  return new Response(JSON.stringify({ success: true, data }), { status: 200 });
}
function down(): Response {
  return new Response(JSON.stringify({ success: false, error: { code: "UPSTREAM_ERROR" } }), {
    status: 502,
  });
}

const NOW = 1_800_000_000;

function healthyUpstreams() {
  upstream.fetchPrices.mockImplementation(async (symbols: string[]) =>
    symbols.map((symbol) => ({ symbol, priceUsd: symbol === "ETH" ? 3000 : 1 }))
  );
  upstream.dextopusRequest.mockResolvedValue(
    new Response(
      JSON.stringify({
        destinations: [
          { destinationChainId: 8453, blockchain: "base", currency: "0xEth", symbol: "ETH" },
        ],
      }),
      { status: 200 }
    )
  );
  upstream.fetchMarketTokens.mockResolvedValue([
    {
      id: "ethereum",
      symbol: "ETH",
      name: "Ether",
      logo: null,
      priceUsd: 2990,
      change24h: 1.5,
      marketCap: 9,
    },
  ]);
  upstream.wsapiPerpRequest.mockImplementation(async (path: string) =>
    path === "pairs"
      ? ok([{ from: "BTC", to: "USD", maxLeverage: 100 }])
      : ok([{ pairIndex: 0, pair: "BTC/USD", price: "65000", publishTime: null }])
  );
  upstream.wsapiRwaRequest.mockResolvedValue(
    ok([
      {
        id: "usdy-base",
        chain: "base",
        address: "0xUsdy",
        symbol: "USDY",
        name: "Ondo",
        issuer: "Ondo",
        category: "treasury",
        priceUsd: "1.14",
        freelyTradable: true,
      },
    ])
  );
  upstream.fetchRwaMarket.mockResolvedValue({ "usdy-base": { change24h: -0.01 } });
  upstream.readActiveGamesWith.mockResolvedValue([
    {
      gameId: 7,
      starter: "0x1",
      king: "0x2",
      potWei: 10n ** 18n,
      minWagerWei: 0n,
      endTime: NOW + 600,
    },
  ]);
  upstream.fetch.mockImplementation(async (url: string) => {
    if (url.startsWith("https://trade.test/tokens/trending")) {
      return ok({
        items: [
          {
            address: "0xMeme",
            symbol: "MEME",
            name: "Meme",
            logoUrl: null,
            priceUsd: "0.01",
            priceChange24hPercent: "12.5",
          },
          {
            address: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
            symbol: "USDC",
            name: "USDC",
            logoUrl: null,
            priceUsd: "1",
            priceChange24hPercent: "0",
          },
        ],
        meta: { page: 1, limit: 8, total: 2 },
      });
    }
    if (url.startsWith("https://vault.test/games")) {
      return ok({
        games: [
          {
            gameId: 5,
            active: true,
            settled: false,
            endTime: NOW + 300,
            pot: { amount: "1", tokenSymbol: "ETH", usdValue: 42, formattedUsd: "$42.00" },
          },
          {
            gameId: 4,
            active: false,
            settled: true,
            endTime: NOW - 300,
            pot: { amount: "1", tokenSymbol: "ETH", usdValue: 1, formattedUsd: "$1.00" },
          },
        ],
      });
    }
    if (url.startsWith("https://chess.test/draughts/matches")) {
      return ok({
        items: [
          { id: "d1", result: null },
          { id: "d2", result: "draw" },
        ],
      });
    }
    if (url.startsWith("https://chess.test/matches")) {
      return ok({
        items: [
          {
            id: "c1",
            result: null,
            createdAt: new Date(NOW * 1000).toISOString(),
            startedAt: null,
            timeControl: { initialSeconds: 300, incrementSeconds: 0 },
            ply: 4,
          },
          {
            id: "bot",
            result: null,
            computer: {},
            createdAt: new Date(NOW * 1000).toISOString(),
            startedAt: null,
            timeControl: { initialSeconds: 300, incrementSeconds: 0 },
            ply: 1,
          },
        ],
      });
    }
    return new Response("not found", { status: 404 });
  });
}

describe("buildDashboardFeed", () => {
  beforeEach(() => {
    resetResponseCache();
    for (const fn of Object.values(upstream)) fn.mockReset();
    vi.stubGlobal("fetch", upstream.fetch);
    vi.spyOn(Date, "now").mockReturnValue(NOW * 1000);
  });

  it("composes every section from the upstreams, once", async () => {
    healthyUpstreams();
    const feed = await buildDashboardFeed();

    // The by-symbol price feed wins over the market feed's figure.
    expect(feed.spot?.[0]).toMatchObject({
      symbol: "ETH",
      name: "Ether",
      priceUsd: 3000,
      change24h: 1.5,
    });
    expect(feed.perps?.[0]).toMatchObject({
      symbol: "BTC/USD",
      base: "BTC",
      priceUsd: 65000,
      maxLeverage: 100,
    });
    expect(feed.memes).toEqual([
      {
        address: "0xMeme",
        symbol: "MEME",
        name: "Meme",
        logoUrl: null,
        priceUsd: "0.01",
        change24h: 12.5,
      },
    ]);
    expect(feed.rwa?.[0]).toMatchObject({
      id: "usdy-base",
      priceUsd: 1.14,
      change24h: -0.01,
      logo: "/api/token-logo/base/0xUsdy",
    });
    // The indexed round leads by pot; the chain-only round is priced from ETH.
    expect(feed.live?.rounds.map((r) => [r.gameId, r.potUsd, r.pot])).toEqual([
      [7, 3000, "$3000.00"],
      [5, 42, "$42.00"],
    ]);
    expect(feed.live?.chess).toEqual([{ id: "c1" }]);
    expect(feed.live?.checkers).toEqual([{ id: "d1" }]);
    expect(feed.asOf).toBe(NOW * 1000);
  });

  it("marks a section unavailable when its upstream is down, and keeps the rest", async () => {
    healthyUpstreams();
    upstream.wsapiRwaRequest.mockResolvedValue(down());
    upstream.wsapiPerpRequest.mockImplementation(async (path: string) =>
      path === "pairs" ? down() : ok([])
    );

    const feed = await buildDashboardFeed();

    expect(feed.rwa).toBeNull();
    expect(feed.perps).toBeNull();
    expect(feed.spot).not.toBeNull();
    expect(feed.memes).not.toBeNull();
  });

  it("prices the perps brief from the fallback when only the marks are down", async () => {
    healthyUpstreams();
    upstream.wsapiPerpRequest.mockImplementation(async (path: string) =>
      path === "pairs" ? ok([{ from: "BTC", to: "USD", maxLeverage: 100 }]) : down()
    );
    upstream.fetchPrices.mockImplementation(async (symbols: string[]) =>
      symbols.map((symbol) => ({ symbol, priceUsd: symbol === "BTC" ? 64000 : 1 }))
    );

    const feed = await buildDashboardFeed();
    expect(feed.perps?.[0]).toMatchObject({ symbol: "BTC/USD", priceUsd: 64000 });
  });

  it("keeps the live chips from the sources that answered", async () => {
    healthyUpstreams();
    upstream.fetch.mockImplementation(async (url: string) => {
      if (url.startsWith("https://chess.test")) return down();
      if (url.startsWith("https://vault.test/games")) return ok({ games: [] });
      if (url.startsWith("https://trade.test"))
        return ok({ items: [], meta: { page: 1, limit: 8, total: 0 } });
      return new Response("", { status: 404 });
    });

    const feed = await buildDashboardFeed();
    expect(feed.live).toEqual({
      rounds: [{ gameId: 7, endTime: NOW + 600, potUsd: 3000, pot: "$3000.00" }],
      chess: [],
      checkers: [],
    });
  });

  it("labels a chain round's pot exactly when it cannot be priced", async () => {
    healthyUpstreams();
    // No ETH price: the label falls back to the pot in ETH, and wei must reach
    // it as an exact decimal, not through a float that rounds the last digits.
    upstream.fetchPrices.mockImplementation(async (symbols: string[]) =>
      symbols.filter((s) => s !== "ETH").map((symbol) => ({ symbol, priceUsd: 1 }))
    );
    upstream.readActiveGamesWith.mockResolvedValue([
      {
        gameId: 9,
        starter: "0x1",
        king: "0x2",
        potWei: 1234567890123456789n,
        minWagerWei: 0n,
        endTime: NOW + 600,
      },
    ]);
    upstream.fetch.mockImplementation(async (url: string) => {
      if (url.startsWith("https://vault.test/games")) return ok({ games: [] });
      if (url.startsWith("https://trade.test"))
        return ok({ items: [], meta: { page: 1, limit: 8, total: 0 } });
      return down();
    });

    const feed = await buildDashboardFeed();
    expect(feed.live?.rounds[0]?.pot).toBe("1.234567890123456789 ETH");
  });

  it("serves the same composed value to every caller inside the window", async () => {
    healthyUpstreams();
    const [a, b] = await Promise.all([buildDashboardFeed(), buildDashboardFeed()]);
    await buildDashboardFeed();

    expect(a).toBe(b);
    expect(upstream.wsapiRwaRequest).toHaveBeenCalledTimes(1);
    expect(upstream.dextopusRequest).toHaveBeenCalledTimes(1);
  });
});
