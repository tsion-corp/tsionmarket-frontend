import "server-only";

// DefiLlama's price chart, the fallback when CoinGecko refuses. Keyless, and it
// takes a CoinGecko id, so it needs nothing the caller does not already have.
const LLAMA_CHART = "https://coins.llama.fi/chart";

export interface AreaPoint {
  time: number;
  value: number;
}

interface LlamaPrice {
  timestamp: number;
  price: number;
}

// DefiLlama takes a window where CoinGecko takes days. These pairs reproduce
// CoinGecko's granularity: intraday for a day, hourly to a week, daily beyond.
function windowFor(days: string): { span: number; period: string } {
  switch (days) {
    case "1":
      return { span: 24, period: "1h" };
    case "7":
      return { span: 168, period: "1h" };
    case "30":
      return { span: 30, period: "1d" };
    case "365":
      return { span: 365, period: "1d" };
    // "max" has no equivalent; the longest window stands in for all of history.
    default:
      return { span: 1000, period: "1d" };
  }
}

// Null, not an empty array: the caller decides whether "no data" is worth a
// retry, and both render the same line otherwise.
export async function fetchLlamaChart(
  coingeckoId: string,
  days: string
): Promise<AreaPoint[] | null> {
  const { span, period } = windowFor(days);
  const key = `coingecko:${coingeckoId}`;
  const url = `${LLAMA_CHART}/${encodeURIComponent(key)}?span=${span}&period=${period}`;

  const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
  if (!res.ok) return null;

  const data = (await res.json()) as { coins?: Record<string, { prices?: LlamaPrice[] }> };
  const prices = data.coins?.[key]?.prices;
  if (!Array.isArray(prices) || prices.length === 0) return null;

  return prices.map(({ timestamp, price }) => ({ time: timestamp, value: price }));
}
