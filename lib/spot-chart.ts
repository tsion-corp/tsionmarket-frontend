// Market filtering and chart routing for the spot terminal.
//
// The market feed is CoinGecko's top coins by market cap, which is full of USD
// stablecoins and tokenised real-world assets. None of those make sense as a
// spot market against USDC (USDC against itself, or a flat $1 line), so they are
// filtered out. For the tradable assets that remain, the big liquid names chart
// on TradingView (the same widget the perps desk uses) and everything else
// charts through our own CoinGecko candle feed, which covers every listed token
// so no market is ever left without a chart.

// USD/EUR pegged stablecoins, plus the USDC quote itself. Trading any of these
// against USDC is meaningless, so they never appear as a market.
const SPOT_STABLES = new Set([
  "USDC",
  "USDT",
  "USDS",
  "USD1",
  "USDE",
  "DAI",
  "USDG",
  "USYC",
  "PYUSD",
  "USDY",
  "USDD",
  "RLUSD",
  "USDF",
  "BFUSD",
  "USDGO",
  "EUTBL",
  "EURSAFO",
  "USTB",
  "JTRSY",
  "STABLE",
  "YLDS",
  "USD0",
  "USX",
  "GHO",
  "USD0++",
  "USDO",
]);

export function isSpotStable(symbol: string): boolean {
  return SPOT_STABLES.has(symbol.toUpperCase());
}

// Symbols with a dependable Binance USDT spot pair, charted on TradingView so
// the major markets look exactly like the perpetuals chart. The CoinGecko
// symbol for each of these matches its Binance base ticker. Anything not listed
// here charts through the CoinGecko candle feed instead (see spotChartSource),
// which is why this set only needs the names TradingView reliably carries, not
// every tradable token.
const TV_BINANCE = new Set([
  "BTC",
  "ETH",
  "BNB",
  "XRP",
  "SOL",
  "DOGE",
  "ADA",
  "TRX",
  "LINK",
  "XLM",
  "LTC",
  "BCH",
  "DOT",
  "AVAX",
  "UNI",
  "ATOM",
  "ETC",
  "FIL",
  "NEAR",
  "ICP",
  "ARB",
  "INJ",
  "AAVE",
  "SHIB",
  "PEPE",
  "SUI",
  "HBAR",
  "POL",
  "ALGO",
  "RENDER",
  "TAO",
  "WLD",
  "ONDO",
  "JUP",
  "ENA",
  "KAS",
  "MORPHO",
  "MNT",
  "PUMP",
]);

export type SpotChartSource = { kind: "tradingview"; symbol: string } | { kind: "coingecko" };

// Where to source the candle chart for a market. TradingView for the liquid
// majors it carries, our CoinGecko feed for the rest so every market charts.
export function spotChartSource(symbol: string): SpotChartSource {
  const up = symbol.toUpperCase();
  if (TV_BINANCE.has(up)) return { kind: "tradingview", symbol: `BINANCE:${up}USDT` };
  return { kind: "coingecko" };
}
