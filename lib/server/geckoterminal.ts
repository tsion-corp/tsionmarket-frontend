import "server-only";
import type { AreaPoint, CandlePoint } from "@/hooks/use-chart";

// GeckoTerminal's DEX candles, keyed on a liquidity pool rather than on a
// listing. This is what charts the long tail: CoinGecko indexes coins it has
// listed, and roughly a third of the memecoins this desk carries have never
// been listed at all. Measured on 2026-09-30 against 20 live Base rows from
// /v1/trade/tokens: 14 resolved a CoinGecko id, 6 answered 404. All six of
// those charted here, 168 hourly candles each.
//
// Alchemy — the paid history behind the RWA chart — was the obvious
// alternative and does not work: it has the same blind spot, answering 400 for
// every one of those six while returning a full week for the tokens CoinGecko
// does list. A pool is the only thing a brand-new token reliably has.
//
// There is a note in lib/server/token-history.ts explaining why GeckoTerminal
// was dropped as a price source before: "two calls per chart because the pool
// had to be discovered first", against a shared keyless budget. That objection
// does not apply here. Every MemeToken already carries `pairAddress` from the
// trade service, so the discovery hop is already paid for and this is one call.
// The budget is real though — see the note on caching at the route.
const GECKOTERMINAL_URL = "https://api.geckoterminal.com/api/v2";
const UPSTREAM_TIMEOUT_MS = 8_000;

// GeckoTerminal's own network ids, from its /networks endpoint. Not the chain
// names this app uses, and not guessable: Ethereum is "eth" and Polygon is
// "polygon_pos". Base and Solana — the two chains the meme desk trades — are
// the only ones this file needs, but the rest are here because three separate
// copies of this map already exist in the repo (both token-logo routes and
// lib/server/rwa-prices.ts) and the next one should be able to use this.
export const GECKOTERMINAL_NETWORK: Record<string, string> = {
  base: "base",
  solana: "solana",
  ethereum: "eth",
  arbitrum: "arbitrum",
  polygon: "polygon_pos",
  bsc: "bsc",
};

// GeckoTerminal takes a timeframe and an aggregate where CoinGecko takes days,
// and it rejects any aggregate it did not name: day accepts only 1, hour
// accepts 1/4/12, minute accepts 1/5/15. These pairs reproduce CoinGecko's
// granularity within those bounds — intraday for a day, hourly to a month,
// daily beyond — and stay under the 1000-candle ceiling the API enforces.
function windowFor(days: string): { timeframe: string; aggregate: number; limit: number } {
  switch (days) {
    case "1":
      return { timeframe: "minute", aggregate: 15, limit: 96 };
    case "7":
      return { timeframe: "hour", aggregate: 1, limit: 168 };
    case "30":
      return { timeframe: "hour", aggregate: 12, limit: 60 };
    case "365":
      return { timeframe: "day", aggregate: 1, limit: 365 };
    // "max" is a CoinGecko-ism with no equivalent here. A pool cannot predate
    // its own creation, and the free tier serves six months, so the longest
    // daily window stands in for all of history.
    default:
      return { timeframe: "day", aggregate: 1, limit: 1000 };
  }
}

// [timestamp, open, high, low, close, volume]. Numbers, not strings — unlike
// most GeckoTerminal attributes, which are decimal strings.
type RawCandle = [number, number, number, number, number, number];

interface OhlcvResponse {
  data?: { attributes?: { ohlcv_list?: RawCandle[] } };
}

interface PoolsResponse {
  data?: { attributes?: { address?: string } }[];
}

// The pool a token actually trades in, asked of the upstream rather than the
// trade service.
//
// This is the discovery call the note in token-history.ts warns about, and it
// runs ONLY when the pool we were given is one the upstream does not index —
// measured at roughly one row in twelve, where the trade service names a pool
// GeckoTerminal has never seen. WETH is the live example: its stored pair 404s
// here while the upstream holds twenty other pools for it, the largest with
// $161m in it. One extra call on that path is worth a chart; on every other
// path it is not paid at all.
//
// `data` is ranked by the upstream on liquidity and volume together, so the
// first entry is the deepest pool. Orientation is not a risk: the OHLCV call
// names the token regardless of which side of the pool it sits on.
async function discoverPool(network: string, token: string): Promise<string | null> {
  const res = await fetch(
    `${GECKOTERMINAL_URL}/networks/${encodeURIComponent(network)}/tokens/${encodeURIComponent(token)}/pools`,
    { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) }
  );
  if (!res.ok) return null;
  const pools = ((await res.json()) as PoolsResponse).data;
  const best = Array.isArray(pools) ? pools[0]?.attributes?.address : null;
  return best ?? null;
}

/**
 * A pool's candles, as the chart consumes them.
 *
 * Null, not an empty array, for "no usable data" — the same contract
 * `fetchLlamaChart` uses, so the route can treat both fallbacks alike.
 *
 * `token` is the token being charted, passed through to the API. It is not
 * decoration: a pool has two sides, and the desk's `pairAddress` may hold the
 * token as the QUOTE rather than the base. Without this the series comes back
 * inverted — the other asset's price, drawn as if it were this one's, with no
 * error to notice.
 */
export async function fetchPoolCandles(
  chain: string,
  pool: string,
  token: string,
  days: string,
  type: "area" | "candles"
): Promise<AreaPoint[] | CandlePoint[] | null> {
  const network = GECKOTERMINAL_NETWORK[chain];
  if (!network) return null;

  const { timeframe, aggregate, limit } = windowFor(days);
  const candlesAt = async (address: string): Promise<RawCandle[] | null> => {
    const url =
      `${GECKOTERMINAL_URL}/networks/${encodeURIComponent(network)}` +
      `/pools/${encodeURIComponent(address)}/ohlcv/${timeframe}` +
      `?aggregate=${aggregate}&limit=${limit}&currency=usd&token=${encodeURIComponent(token)}`;
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const list = ((await res.json()) as OhlcvResponse).data?.attributes?.ohlcv_list;
    return Array.isArray(list) && list.length > 0 ? list : null;
  };

  // The trade service's pool first, because it costs nothing to try and is
  // right most of the time. A pool the upstream does not index is not the end
  // of the chart: the token is asked for its own pools and the deepest one is
  // tried instead.
  let raw = await candlesAt(pool);
  if (raw === null) {
    const discovered = await discoverPool(network, token);
    if (discovered && discovered.toLowerCase() !== pool.toLowerCase()) {
      raw = await candlesAt(discovered);
    }
  }
  if (raw === null) return null;

  // GeckoTerminal returns newest first. The chart library wants ascending and
  // throws on a repeated timestamp rather than skipping it, so this sorts and
  // de-duplicates rather than trusting the order it was given.
  const byTime = new Map<number, RawCandle>();
  for (const row of raw) {
    if (!Array.isArray(row) || row.length < 5) continue;
    const [time] = row;
    if (!Number.isFinite(time)) continue;
    byTime.set(Math.floor(time), row);
  }
  const ordered = [...byTime.values()].sort((a, b) => a[0] - b[0]);
  if (ordered.length === 0) return null;

  if (type === "candles") {
    return ordered.map(([time, open, high, low, close]) => ({
      time: Math.floor(time),
      open,
      high,
      low,
      close,
    }));
  }
  // An area chart draws the close, which is the price the candle ended at.
  return ordered.map(([time, , , , close]) => ({ time: Math.floor(time), value: close }));
}
