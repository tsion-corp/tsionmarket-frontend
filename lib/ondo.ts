// Ondo Finance real-world-asset catalog. This file holds static product
// metadata only. Live price, 24h and 1y change, and market cap come from
// CoinGecko through /api/ondo. The CoinGecko id on each product also drives the
// real chart shown in the detail sheet.

import { formatUsd } from "@/lib/trade/math";

export type OndoCategory = "Treasuries" | "Stocks" | "ETFs" | "Metals";

export const ONDO_TABS = ["All", "Treasuries", "Stocks", "ETFs", "Metals"] as const;
export type OndoTab = (typeof ONDO_TABS)[number];

export interface OndoProduct {
  // CoinGecko id. Used both for the markets lookup and the chart.
  id: string;
  symbol: string;
  name: string;
  ticker: string;
  category: OndoCategory;
  bg: string;
  blurb: string;
  facts: string[];
  // Treasuries whose price accrues yield. Their trailing 1y return is the yield.
  yieldBearing?: boolean;
}

// Curated slice of Ondo's live product range. Every entry resolves to real
// CoinGecko market data and a real price chart.
export const ONDO_PRODUCTS: OndoProduct[] = [
  {
    id: "ondo-us-dollar-yield",
    symbol: "USDY",
    name: "US Dollar Yield",
    ticker: "USDY",
    category: "Treasuries",
    bg: "linear-gradient(135deg,#A78BFA,#6d5bd0)",
    blurb:
      "A tokenized note secured by short-term US Treasuries and bank demand deposits. Yield accrues into the token price every day.",
    facts: ["Backed by US Treasuries", "Yield accrues daily", "Redeemable onchain"],
    yieldBearing: true,
  },
  {
    id: "ousg",
    symbol: "OUSG",
    name: "Short-Term Treasuries",
    ticker: "OUSG",
    category: "Treasuries",
    bg: "linear-gradient(135deg,#8B7BE0,#4c3fa0)",
    blurb:
      "Ondo's tokenized fund of short-duration US Treasuries. Institutional cash management that mints and redeems around the clock.",
    facts: ["Short-term US Treasuries", "Instant mint and redeem", "Held by a regulated custodian"],
    yieldBearing: true,
  },
  {
    id: "nvidia-ondo-tokenized-stock",
    symbol: "NVDA",
    name: "NVIDIA",
    ticker: "NVDAon",
    category: "Stocks",
    bg: "linear-gradient(135deg,#76B900,#3c5f00)",
    blurb:
      "Tokenized NVIDIA shares issued through Ondo Global Markets. Each token tracks the real listed stock.",
    facts: ["Issued by Ondo Global Markets", "Tracks the listed share", "Trades onchain 24/7"],
  },
  {
    id: "tesla-ondo-tokenized-stock",
    symbol: "TSLA",
    name: "Tesla",
    ticker: "TSLAon",
    category: "Stocks",
    bg: "linear-gradient(135deg,#E82127,#7a1013)",
    blurb:
      "Tokenized Tesla shares issued through Ondo Global Markets. Each token tracks the real listed stock.",
    facts: ["Issued by Ondo Global Markets", "Tracks the listed share", "Trades onchain 24/7"],
  },
  {
    id: "coinbase-ondo-tokenized-stock",
    symbol: "COIN",
    name: "Coinbase",
    ticker: "COINon",
    category: "Stocks",
    bg: "linear-gradient(135deg,#1652F0,#0b2f8c)",
    blurb:
      "Tokenized Coinbase shares issued through Ondo Global Markets. Each token tracks the real listed stock.",
    facts: ["Issued by Ondo Global Markets", "Tracks the listed share", "Trades onchain 24/7"],
  },
  {
    id: "alphabet-class-a-ondo-tokenized-stock",
    symbol: "GOOGL",
    name: "Alphabet",
    ticker: "GOOGLon",
    category: "Stocks",
    bg: "linear-gradient(135deg,#4285F4,#1a53c0)",
    blurb:
      "Tokenized Alphabet Class A shares issued through Ondo Global Markets. Each token tracks the real listed stock.",
    facts: ["Issued by Ondo Global Markets", "Tracks the listed share", "Trades onchain 24/7"],
  },
  {
    id: "microstrategy-ondo-tokenized-stock",
    symbol: "MSTR",
    name: "MicroStrategy",
    ticker: "MSTRon",
    category: "Stocks",
    bg: "linear-gradient(135deg,#F7931A,#8a5310)",
    blurb:
      "Tokenized MicroStrategy shares issued through Ondo Global Markets. Each token tracks the real listed stock.",
    facts: ["Issued by Ondo Global Markets", "Tracks the listed share", "Trades onchain 24/7"],
  },
  {
    id: "spdr-s-p-500-etf-ondo-tokenized-etf",
    symbol: "SPY",
    name: "S&P 500 ETF",
    ticker: "SPYon",
    category: "ETFs",
    bg: "linear-gradient(135deg,#4b6cb7,#182848)",
    blurb: "Tokenized SPDR S&P 500 ETF. One token for exposure to the 500 largest US companies.",
    facts: ["Tracks the SPDR S&P 500 ETF", "Broad US market exposure", "Trades onchain 24/7"],
  },
  {
    id: "invesco-qqq-etf-ondo-tokenized-etf",
    symbol: "QQQ",
    name: "Invesco QQQ ETF",
    ticker: "QQQon",
    category: "ETFs",
    bg: "linear-gradient(135deg,#00C4B4,#00786d)",
    blurb: "Tokenized Invesco QQQ ETF, tracking the Nasdaq-100's largest technology names.",
    facts: ["Tracks the Invesco QQQ ETF", "Nasdaq-100 exposure", "Trades onchain 24/7"],
  },
  {
    id: "ishares-20-year-treasury-bond-etf-ondo-tokenized-etf",
    symbol: "TLT",
    name: "20+ Year Treasuries",
    ticker: "TLTon",
    category: "ETFs",
    bg: "linear-gradient(135deg,#5FA8A0,#2c5c56)",
    blurb:
      "Tokenized iShares 20+ Year Treasury Bond ETF. Long-duration US government bonds, onchain.",
    facts: ["Tracks the iShares TLT ETF", "Long-duration Treasuries", "Trades onchain 24/7"],
  },
  {
    id: "ishares-gold-trust-ondo-tokenized-stock",
    symbol: "IAU",
    name: "Gold Trust",
    ticker: "IAUon",
    category: "Metals",
    bg: "linear-gradient(135deg,#E7C97C,#9c7d2e)",
    blurb:
      "Tokenized iShares Gold Trust. Exposure to physical gold, issued through Ondo Global Markets.",
    facts: ["Tracks the iShares Gold Trust", "Physical gold exposure", "Trades onchain 24/7"],
  },
  {
    id: "ishares-silver-trust-ondo-tokenized-stock",
    symbol: "SLV",
    name: "Silver Trust",
    ticker: "SLVon",
    category: "Metals",
    bg: "linear-gradient(135deg,#C0C6CE,#7c828b)",
    blurb:
      "Tokenized iShares Silver Trust. Exposure to physical silver, issued through Ondo Global Markets.",
    facts: ["Tracks the iShares Silver Trust", "Physical silver exposure", "Trades onchain 24/7"],
  },
];

export const ONDO_PRODUCT_IDS = ONDO_PRODUCTS.map((p) => p.id);

// Live market numbers for one product, sourced from CoinGecko.
export interface OndoMarket {
  id: string;
  symbol: string;
  logo?: string | null;
  priceUsd: number;
  change24h: number;
  change1y: number | null;
  marketCap: number;
}

// Product metadata merged with its live market numbers, ready to render.
export interface OndoRow extends OndoProduct {
  logo: string | null;
  priceUsd: number;
  change24h: number;
  change1y: number | null;
  marketCap: number;
  up: boolean;
  hasData: boolean;
  priceLabel: string;
  change24hLabel: string;
  metricLabel: string;
  metricValue: string;
  mcapLabel: string;
}

export function formatPercent(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

export function formatCompactUsd(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "—";
  return `$${Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(value)}`;
}

export function buildOndoRow(product: OndoProduct, market?: OndoMarket): OndoRow {
  const hasData = Boolean(market && market.priceUsd > 0);
  const change24h = market?.change24h ?? 0;
  const metricLabel = product.yieldBearing ? "1Y yield" : "1Y";
  return {
    ...product,
    logo: market?.logo ?? null,
    priceUsd: market?.priceUsd ?? 0,
    change24h,
    change1y: market?.change1y ?? null,
    marketCap: market?.marketCap ?? 0,
    up: change24h >= 0,
    hasData,
    priceLabel: hasData ? formatUsd(market!.priceUsd) : "—",
    change24hLabel: hasData ? formatPercent(change24h) : "—",
    metricLabel,
    metricValue: formatPercent(market?.change1y),
    mcapLabel: formatCompactUsd(market?.marketCap ?? 0),
  };
}
