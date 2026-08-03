import "server-only";

// Hourly price history for one token, from Alchemy's historical prices — the
// same premium key the portfolio uses, covering Solana and every EVM chain we
// trade on. It backs both the RWA detail chart and the 24h change we show for
// EVM assets, so one cached series serves both.
//
// The earlier source (GeckoTerminal, keyless) could not carry this: 30 requests
// a minute shared across all users, and two calls per chart because the pool
// had to be discovered first. It rate-limited within a handful of opened
// modals, and its series occasionally repeats a timestamp — which the chart
// library rejects outright rather than skipping.

const ALCHEMY_PRICES_URL = "https://api.g.alchemy.com/prices/v1";
const UPSTREAM_TIMEOUT_MS = 8_000;
const CACHE_TTL_MS = 5 * 60_000;
// A week of hourly closes: enough shape to read a trend without a series so
// dense it turns to noise at this width.
const WINDOW_HOURS = 168;

export interface HistoryPoint {
  // Unix seconds, ascending and unique — what the chart library requires.
  time: number;
  value: number;
}

export const CHAIN_TO_ALCHEMY_NETWORK: Record<string, string> = {
  solana: "solana-mainnet",
  base: "base-mainnet",
  ethereum: "eth-mainnet",
  arbitrum: "arb-mainnet",
  polygon: "polygon-mainnet",
};

const cache = new Map<string, { expires: number; points: HistoryPoint[] }>();

interface AlchemyHistoryResponse {
  data?: { value?: string; timestamp?: string }[];
}

// Ascending, de-duplicated points. A repeated timestamp keeps the later value:
// duplicates make the chart library throw, which would blank the whole sheet.
function normalize(rows: AlchemyHistoryResponse["data"]): HistoryPoint[] {
  const byTime = new Map<number, number>();
  for (const row of rows ?? []) {
    const value = Number(row.value);
    const time = Math.floor(Date.parse(row.timestamp ?? "") / 1000);
    if (!Number.isFinite(value) || value <= 0 || !Number.isFinite(time)) continue;
    byTime.set(time, value);
  }
  return [...byTime.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([time, value]) => ({ time, value }));
}

// A week of hourly closes, or an empty series when the token has no history.
// Never throws: a missing chart is a dash, not a failed page.
export async function fetchTokenHistory(chain: string, address: string): Promise<HistoryPoint[]> {
  const network = CHAIN_TO_ALCHEMY_NETWORK[chain];
  const key = process.env.ALCHEMY_API_KEY;
  if (!network || !key) return [];

  const cacheKey = `${network}:${address.toLowerCase()}`;
  const hit = cache.get(cacheKey);
  if (hit && hit.expires > Date.now()) return hit.points;

  const endTime = new Date();
  const startTime = new Date(endTime.getTime() - WINDOW_HOURS * 3_600_000);

  try {
    const res = await fetch(`${ALCHEMY_PRICES_URL}/${key}/tokens/historical`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        network,
        address,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        interval: "1h",
      }),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) return [];
    const points = normalize(((await res.json()) as AlchemyHistoryResponse).data);
    cache.set(cacheKey, { expires: Date.now() + CACHE_TTL_MS, points });
    return points;
  } catch {
    return [];
  }
}

// Percent move over the last 24 hours, read off the same series. Null when the
// history is too short to span a day.
export function change24hFrom(points: HistoryPoint[]): number | undefined {
  if (points.length < 2) return undefined;
  const last = points[points.length - 1];
  const cutoff = last.time - 24 * 3_600;
  // The first point at or after the cutoff is the reading a day ago.
  const earlier = points.find((p) => p.time >= cutoff) ?? points[0];
  if (earlier === last || earlier.value <= 0) return undefined;
  return ((last.value - earlier.value) / earlier.value) * 100;
}
