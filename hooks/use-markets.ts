"use client";

import { useQuery } from "@tanstack/react-query";
import { usePrices } from "@/hooks/use-prices";
import { formatUsd } from "@/lib/trade/math";
import { formatPercent, type OndoMarket } from "@/lib/ondo";

const THIRTY_SECONDS = 30 * 1000;

export const MARKET_TABS = ["All", "Crypto", "Stocks", "Gold", "Treasuries"] as const;
export type MarketTab = (typeof MARKET_TABS)[number];

interface MarketEntry {
  symbol: string;
  name: string;
  ticker: string;
  category: Exclude<MarketTab, "All">;
  coingeckoId: string;
  bg: string;
  // Alchemy symbol for the live spot price. Present only for assets Alchemy
  // prices by symbol. The rest fall back to the CoinGecko price.
  priceSymbol?: string;
}

// The tradable markets list. Crypto prices come from usePrices (Alchemy).
// Tokenized equities, gold and treasuries resolve through the CoinGecko proxy.
const MARKET_CATALOG: MarketEntry[] = [
  {
    symbol: "SOL",
    name: "Solana",
    ticker: "SOL",
    category: "Crypto",
    coingeckoId: "solana",
    bg: "linear-gradient(135deg,#9945FF,#14F195)",
    priceSymbol: "SOL",
  },
  {
    symbol: "BTC",
    name: "Bitcoin",
    ticker: "BTC",
    category: "Crypto",
    coingeckoId: "bitcoin",
    bg: "linear-gradient(135deg,#F7931A,#8a5310)",
    priceSymbol: "BTC",
  },
  {
    symbol: "ETH",
    name: "Ethereum",
    ticker: "ETH",
    category: "Crypto",
    coingeckoId: "ethereum",
    bg: "linear-gradient(135deg,#627EEA,#33427c)",
    priceSymbol: "ETH",
  },
  {
    symbol: "BNB",
    name: "BNB",
    ticker: "BNB",
    category: "Crypto",
    coingeckoId: "binancecoin",
    bg: "linear-gradient(135deg,#F3BA2F,#946f16)",
    priceSymbol: "BNB",
  },
  {
    symbol: "NVDA",
    name: "NVIDIA",
    ticker: "NVDAon",
    category: "Stocks",
    coingeckoId: "nvidia-ondo-tokenized-stock",
    bg: "linear-gradient(135deg,#76B900,#3c5f00)",
  },
  {
    symbol: "TSLA",
    name: "Tesla",
    ticker: "TSLAon",
    category: "Stocks",
    coingeckoId: "tesla-ondo-tokenized-stock",
    bg: "linear-gradient(135deg,#E82127,#7a1013)",
  },
  {
    symbol: "COIN",
    name: "Coinbase",
    ticker: "COINon",
    category: "Stocks",
    coingeckoId: "coinbase-ondo-tokenized-stock",
    bg: "linear-gradient(135deg,#1652F0,#0b2f8c)",
  },
  {
    symbol: "SPY",
    name: "S&P 500 ETF",
    ticker: "SPYon",
    category: "Stocks",
    coingeckoId: "spdr-s-p-500-etf-ondo-tokenized-etf",
    bg: "linear-gradient(135deg,#4b6cb7,#182848)",
  },
  {
    symbol: "IAU",
    name: "Gold Trust",
    ticker: "IAUon",
    category: "Gold",
    coingeckoId: "ishares-gold-trust-ondo-tokenized-stock",
    bg: "linear-gradient(135deg,#E7C97C,#9c7d2e)",
  },
  {
    symbol: "OUSG",
    name: "Short-Term Treasuries",
    ticker: "OUSG",
    category: "Treasuries",
    coingeckoId: "ousg",
    bg: "linear-gradient(135deg,#8B7BE0,#4c3fa0)",
  },
  {
    symbol: "USDY",
    name: "US Dollar Yield",
    ticker: "USDY",
    category: "Treasuries",
    coingeckoId: "ondo-us-dollar-yield",
    bg: "linear-gradient(135deg,#A78BFA,#6d5bd0)",
  },
];

export interface MarketRow {
  symbol: string;
  name: string;
  ticker: string;
  category: Exclude<MarketTab, "All">;
  coingeckoId: string;
  bg: string;
  logo: string | null;
  priceUsd: number;
  change24h: number;
  up: boolean;
  hasData: boolean;
  priceLabel: string;
  change24hLabel: string;
}

interface UseMarketsResult {
  rows: MarketRow[];
  loading: boolean;
  error: boolean;
}

export function useMarkets(): UseMarketsResult {
  const priceSymbols = MARKET_CATALOG.map((e) => e.priceSymbol).filter((s): s is string =>
    Boolean(s)
  );
  const prices = usePrices(priceSymbols);

  const ids = MARKET_CATALOG.map((e) => e.coingeckoId);
  const { data, isPending, isError } = useQuery<Record<string, OndoMarket>>({
    queryKey: ["markets", ids],
    queryFn: async () => {
      const params = new URLSearchParams();
      for (const id of ids) params.append("ids", id);
      const res = await fetch(`/api/ondo?${params.toString()}`);
      if (!res.ok) throw new Error("Markets request failed");
      const body = await res.json();
      const map: Record<string, OndoMarket> = {};
      for (const market of body.markets ?? []) map[market.id] = market;
      return map;
    },
    staleTime: THIRTY_SECONDS,
    refetchInterval: THIRTY_SECONDS,
  });

  const rows = MARKET_CATALOG.map((entry) => {
    const market = data?.[entry.coingeckoId];
    const alchemyPrice = entry.priceSymbol ? prices[entry.priceSymbol] : undefined;
    const priceUsd = alchemyPrice && alchemyPrice > 0 ? alchemyPrice : (market?.priceUsd ?? 0);
    const change24h = market?.change24h ?? 0;
    const hasData = priceUsd > 0;
    return {
      symbol: entry.symbol,
      name: entry.name,
      ticker: entry.ticker,
      category: entry.category,
      coingeckoId: entry.coingeckoId,
      bg: entry.bg,
      logo: market?.logo ?? null,
      priceUsd,
      change24h,
      up: change24h >= 0,
      hasData,
      priceLabel: hasData ? formatUsd(priceUsd) : "—",
      change24hLabel: market ? formatPercent(change24h) : "—",
    };
  });

  return { rows, loading: isPending, error: isError };
}
