// Maps a Hyperliquid asset symbol to the TradingView symbol its chart embeds
// with. Native Hyperliquid symbols are bare bases with no explicit quote
// ("BTC", "ETH"); HIP-3 builder-dex listings arrive in wire form with a dex
// prefix ("xyz:AAPL") which must come off before any venue lookup — left on,
// it produced unresolvable symbols like "COINBASE:xyz:AAPLUSD" and every
// non-crypto chart rendered blank.

// Venue per crypto base, resolved against TradingView's symbol-search API —
// Coinbase covers nearly every Hyperliquid-listed major; the handful it
// lacks chart on the venue TradingView actually serves them from.
const CRYPTO_VENUE: Record<string, string> = {
  JUP: "OKX:JUPUSD",
  XMR: "CRYPTO:XMRUSD",
};

// Hyperliquid prefixes rebased/wrapped listings with "k" (1000x-scaled
// memecoins like kPEPE, kSHIB, kBONK) — TradingView quotes the unwrapped
// asset, so the prefix has to come off before venue lookup.
function unwrapSymbol(symbol: string): string {
  return symbol.startsWith("k") && symbol.length > 1 ? symbol.slice(1) : symbol;
}

// "xyz:AAPL" -> "AAPL". Native symbols have no colon and pass through.
function stripDexPrefix(symbol: string): string {
  const colon = symbol.indexOf(":");
  return colon >= 0 ? symbol.slice(colon + 1) : symbol;
}

// Category comes from the backend's asset metadata (HlAsset.category). Only
// crypto gets the USD-pair venue treatment; everything else (equities,
// forex, commodities, indices) is passed to TradingView as the bare base and
// resolved by its own symbol search — "AAPL", "US500", "XAUUSD" all resolve
// natively, and a bare base that doesn't is still a searchable prompt in the
// widget rather than a guaranteed-dead COINBASE:...USD synthetic.
export function tradingViewSymbolForAsset(symbol: string, category?: string | null): string {
  const base = unwrapSymbol(stripDexPrefix(symbol));
  if (category && category !== "crypto") return base;
  return CRYPTO_VENUE[base] ?? `COINBASE:${base}USD`;
}
