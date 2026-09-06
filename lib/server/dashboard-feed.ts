import "server-only";

import { createPublicClient, custom, formatEther } from "viem";
import { base } from "viem/chains";
import { fetchPrices } from "@/lib/server/alchemy";
import { dextopusRequest } from "@/lib/server/dextopus";
import { forwardEvmRpcRead } from "@/lib/server/evm-rpc";
import { fetchMarketTokens } from "@/lib/server/market-tokens";
import { cached } from "@/lib/server/response-cache";
import { fetchRwaMarket } from "@/lib/server/rwa-prices";
import { CHESS_BASE, TRADE_BASE, VAULT_BASE } from "@/lib/server/upstreams";
import { wsapiPerpRequest, wsapiRwaRequest } from "@/lib/server/wsapi";
import { BUY_ORIGIN, toBuyRoutes } from "@/lib/buy";
import { isPlausiblyActiveMatch, type LiveMatchClock } from "@/lib/chess/live-match";
import {
  DASHBOARD_FEED_ROWS,
  type DashboardFeed,
  type DashboardLive,
  type LiveRound,
  type MemeBriefRow,
  type RwaBriefRow,
  type SpotBriefRow,
} from "@/lib/dashboard-feed";
import { withoutQuoteCurrency, type Paged } from "@/lib/meme/catalog";
import type { MemeToken } from "@/lib/meme/types";
import { composePerpBrief, perpBriefFallbackSymbols, type PerpBriefRow } from "@/lib/perp/brief";
import type { PerpPair, PerpPrice } from "@/lib/perp/types";
import { assetPriceUsd, listedRwaAssets, rwaLogoPath, type RwaApiAsset } from "@/lib/rwa/catalog";
import { composeSpotMarkets } from "@/lib/spot-markets";
import { getSponsoredEvmChainByNetwork } from "@/lib/trade/sponsored-evm";
import { VAULT_CHAIN_ID } from "@/lib/vault/contract";
import { readActiveGamesWith } from "@/lib/vault/read";

// The dashboard's public data, composed once for every user.
//
// Before this each browser polled thirteen upstreams itself for the four
// briefs and the marquee, two of which were down and were asked anyway, every
// tick, by every tab. Here the server asks each upstream once per window,
// caches the composed value, and hands the same body to everyone. An upstream
// that cannot answer leaves its section null; the brief shows its unavailable
// state, and no browser asks that upstream itself.
//
// Nothing here may depend on the caller. There is no session, no wallet, no
// header read: the route serves this with `public, s-maxage`, and a per-user
// value in it would be served to the next user.

// How long one composed feed serves. The briefs poll every thirty seconds and
// the marks in them move slowly; twenty keeps every tab within one window.
const FEED_TTL_MS = 20_000;

// Each upstream gets this long. The whole feed is assembled in parallel, so
// the slowest upstream, not the sum, bounds the build.
const UPSTREAM_TIMEOUT_MS = 6_000;

// The trending upstream hangs for ~10s before failing; the catalog page is
// the fallback and must land inside the same window.
const TRENDING_TIMEOUT_MS = 4_000;
const TRENDING_FALLBACK_LIMIT = 40;

interface Envelope<T> {
  success?: boolean;
  data?: T;
}

// Every gateway service answers { success, data | error }. Anything else, a
// non-2xx or a body without data, is a failure of that section.
async function envelopeData<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => null)) as Envelope<T> | null;
  if (!res.ok || !body?.success || body.data === undefined) {
    throw new Error(`upstream ${res.status}`);
  }
  return body.data;
}

function getJson(url: string, revalidate: number, timeoutMs = UPSTREAM_TIMEOUT_MS) {
  return fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(timeoutMs),
    next: { revalidate },
  });
}

async function priceMap(symbols: string[]): Promise<Record<string, number>> {
  if (symbols.length === 0) return {};
  const out: Record<string, number> = {};
  for (const { symbol, priceUsd } of await fetchPrices(symbols)) out[symbol] = priceUsd;
  return out;
}

async function spotSection(): Promise<SpotBriefRow[]> {
  const query = new URLSearchParams({
    originChainId: String(BUY_ORIGIN.chainId),
    originAddress: BUY_ORIGIN.asset,
  });
  const [destinationsRes, feed] = await Promise.all([
    dextopusRequest("deposit/destinations", {
      method: "GET",
      purpose: "trade",
      query,
      revalidate: 600,
    }),
    fetchMarketTokens("popular").catch(() => []),
  ]);
  if (!destinationsRes.ok) throw new Error(`destinations ${destinationsRes.status}`);
  const destinations = toBuyRoutes(await destinationsRes.json());
  const markets = composeSpotMarkets(destinations, feed, {});
  const prices = await priceMap(markets.map((m) => m.symbol));
  return composeSpotMarkets(destinations, feed, prices)
    .slice(0, DASHBOARD_FEED_ROWS)
    .map(({ symbol, name, logo, priceUsd, change24h }) => ({
      symbol,
      name,
      logo,
      priceUsd,
      change24h,
    }));
}

async function perpsSection(): Promise<PerpBriefRow[]> {
  const pairs = (
    await envelopeData<PerpPair[]>(
      await wsapiPerpRequest("pairs", { method: "GET", revalidate: 300 })
    )
  ).filter((p) => p.from !== "" && p.to !== "");
  // The marks are a bonus over the CoinGecko fallback, not a requirement: a
  // gateway that serves pairs but not prices still gets a priced brief.
  const [marks, fallback] = await Promise.all([
    wsapiPerpRequest("prices", { method: "GET", revalidate: 3 })
      .then((res) => envelopeData<PerpPrice[]>(res))
      .catch((): PerpPrice[] => []),
    priceMap(perpBriefFallbackSymbols(DASHBOARD_FEED_ROWS)),
  ]);
  return composePerpBrief(pairs, marks, fallback, DASHBOARD_FEED_ROWS);
}

async function memesSection(): Promise<MemeBriefRow[]> {
  const trending = async () =>
    envelopeData<Paged<MemeToken>>(
      await getJson(`${TRADE_BASE}/tokens/trending`, 15, TRENDING_TIMEOUT_MS)
    );
  const catalog = async () =>
    envelopeData<Paged<MemeToken>>(
      await getJson(`${TRADE_BASE}/tokens?page=1&limit=${TRENDING_FALLBACK_LIMIT}&chain=base`, 15)
    );
  const page = withoutQuoteCurrency(await trending().catch(catalog));
  return page.items.slice(0, DASHBOARD_FEED_ROWS).map((t) => {
    const change = t.priceChange24hPercent == null ? NaN : Number(t.priceChange24hPercent);
    return {
      address: t.address,
      symbol: t.symbol,
      name: t.name,
      logoUrl: t.logoUrl,
      priceUsd: t.priceUsd,
      change24h: Number.isFinite(change) ? change : null,
    };
  });
}

async function rwaSection(): Promise<RwaBriefRow[]> {
  const assets = await envelopeData<RwaApiAsset[]>(
    await wsapiRwaRequest("assets", { method: "GET", revalidate: 60 })
  );
  const listed = listedRwaAssets(assets).slice(0, DASHBOARD_FEED_ROWS);
  // Market stats are an enrichment; the registry's own price still stands
  // when the market read fails.
  const market = await fetchRwaMarket(
    listed.map((a) => ({ id: a.id, chain: a.chain, address: a.address })),
    false
  ).catch(() => ({}) as Awaited<ReturnType<typeof fetchRwaMarket>>);
  return listed.map((a) => {
    const stats = market[a.id];
    return {
      id: a.id,
      symbol: a.symbol,
      name: a.name,
      logo: rwaLogoPath(a.chain, a.address),
      priceUsd: assetPriceUsd(a) ?? stats?.priceUsd ?? null,
      change24h: stats?.change24h ?? null,
    };
  });
}

// The vault index's game shape, only the fields the marquee reads.
interface IndexedGame {
  gameId: number;
  active: boolean;
  settled: boolean;
  endTime: number;
  pot: { amount: string; tokenSymbol: string; usdValue: number; formattedUsd: string };
}

interface ChessMatchWireLite extends LiveMatchClock {
  id: string;
  computer?: unknown;
  result: unknown;
}

interface DraughtsMatchWireLite {
  id: string;
  computer?: unknown;
  result: unknown;
}

// A viem client for Base that reads through the same provider the RPC route
// uses, without the route: this runs on the server already.
function baseReadClient() {
  const chain = getSponsoredEvmChainByNetwork("base-mainnet");
  if (!chain || chain.chainId !== VAULT_CHAIN_ID) throw new Error("Base is not configured");
  let id = 0;
  return createPublicClient({
    chain: base,
    transport: custom({
      async request({ method, params }) {
        const { payload } = await forwardEvmRpcRead(chain, {
          jsonrpc: "2.0",
          id: ++id,
          method,
          params,
        });
        const envelope = (Array.isArray(payload) ? payload[0] : payload) as {
          result?: unknown;
          error?: { message?: string };
        };
        if (envelope?.error) throw new Error(envelope.error.message ?? "rpc error");
        return envelope?.result;
      },
    }),
  });
}

async function liveSection(): Promise<DashboardLive> {
  const now = Math.floor(Date.now() / 1000);
  // Each source contributes nothing when it fails, as the marquee always did;
  // a dead chess gateway must not empty the Last Man chips.
  const [indexed, chain, ethUsd, chess, checkers] = await Promise.all([
    getJson(`${VAULT_BASE}/games`, 5)
      .then((res) => envelopeData<{ games: IndexedGame[] }>(res))
      .then((data) => data.games)
      .catch((error): IndexedGame[] => {
        console.warn("[dashboard-feed] live: vault index unavailable:", error);
        return [];
      }),
    readActiveGamesWith(baseReadClient(), now).catch((error) => {
      console.warn("[dashboard-feed] live: chain read unavailable:", error);
      return [];
    }),
    priceMap(["ETH"])
      .then((p) => p.ETH ?? 0)
      .catch(() => 0),
    getJson(`${CHESS_BASE}/matches?status=active&limit=50`, 5)
      .then((res) => envelopeData<{ items: ChessMatchWireLite[] }>(res))
      .then((data) => data.items)
      .catch((error): ChessMatchWireLite[] => {
        console.warn("[dashboard-feed] live: chess unavailable:", error);
        return [];
      }),
    getJson(`${CHESS_BASE}/draughts/matches?status=active&limit=50`, 5)
      .then((res) => envelopeData<{ items: DraughtsMatchWireLite[] }>(res))
      .then((data) => data.items)
      .catch((error): DraughtsMatchWireLite[] => {
        console.warn("[dashboard-feed] live: draughts unavailable:", error);
        return [];
      }),
  ]);

  const live = indexed.filter((g) => g.active && !g.settled && g.endTime > now);
  const indexedIds = new Set(live.map((g) => g.gameId));
  const rounds: LiveRound[] = [
    ...live.map((g) => ({
      gameId: g.gameId,
      endTime: g.endTime,
      potUsd: g.pot.usdValue,
      pot: g.pot.formattedUsd || `${g.pot.amount} ${g.pot.tokenSymbol}`,
    })),
    // Chain rounds the index has not caught up with yet, priced here since the
    // contract only knows wei.
    ...chain
      .filter((g) => !indexedIds.has(g.gameId) && g.endTime > now)
      .map((g) => {
        // Wei to ether as an exact decimal string; the label carries every
        // digit. The USD figure is display only, a sort key and a rounded
        // label, and is the one place a float is allowed to enter.
        const eth = formatEther(g.potWei);
        const usd = ethUsd > 0 ? Number(eth) * ethUsd : 0;
        return {
          gameId: g.gameId,
          endTime: g.endTime,
          potUsd: usd,
          pot: usd > 0 ? `$${usd.toFixed(2)}` : `${eth} ETH`,
        };
      }),
  ].sort((a, b) => b.potUsd - a.potUsd);

  return {
    rounds,
    chess: chess
      .filter((m) => !m.computer && m.result === null && isPlausiblyActiveMatch(m))
      .map((m) => ({ id: m.id })),
    checkers: checkers.filter((m) => !m.computer && m.result === null).map((m) => ({ id: m.id })),
  };
}

// A section that cannot be built is null, never a guess: the brief shows its
// unavailable state. The failure is logged with its section so an upstream
// that is down shows up in the server logs rather than only as a quiet gap.
async function section<T>(name: keyof DashboardFeed, load: () => Promise<T>): Promise<T | null> {
  try {
    return await load();
  } catch (error) {
    console.warn(`[dashboard-feed] ${name} unavailable:`, error);
    return null;
  }
}

async function compose(): Promise<DashboardFeed> {
  const [spot, perps, memes, rwa, live] = await Promise.all([
    section("spot", spotSection),
    section("perps", perpsSection),
    section("memes", memesSection),
    section("rwa", rwaSection),
    section("live", liveSection),
  ]);
  return { asOf: Date.now(), spot, perps, memes, rwa, live };
}

/** The feed, composed at most once per window for every caller. */
export function buildDashboardFeed(): Promise<DashboardFeed> {
  return cached("dashboard-feed", compose, FEED_TTL_MS);
}
