// Maps a perp pair to the TradingView symbol its chart embeds with. Every
// asset class charts through TradingView (CoinGecko only ever covered a
// handful of crypto majors): crypto uses TradingView's aggregate CRYPTO index,
// forex the FXCM feed for majors and the IDC composite for exotics, and
// commodities/equities per-venue symbols. Unknown listings fall through to a
// best-guess prefix; TradingView renders its own "symbol not found" state for
// a miss, which still beats showing no chart at all.

import type { PerpPair } from "@/lib/perp/types";

// Pairs whose venue or ticker cannot be derived from the symbol alone.
const OVERRIDES: Record<string, string> = {
  // Commodities: metals price via OANDA, oil via TradingView's own CFD feeds.
  "XAU/USD": "OANDA:XAUUSD",
  "XAG/USD": "OANDA:XAGUSD",
  "WTI/USD": "TVC:USOIL",
  "USOILSPOT/USD": "TVC:USOIL",
  "BRENT/USD": "TVC:UKOIL",
  // Index perps chart against the underlying index.
  "US500/USD": "SP:SPX",
  "US100/USD": "NASDAQ:NDX",
  // Equities listed somewhere other than NASDAQ (the default below).
  "CRCL/USD": "NYSE:CRCL",
  "BABA/USD": "NYSE:BABA",
  "BB/USD": "NYSE:BB",
  "EWY/USD": "AMEX:EWY",
  "SK HYNIX/USD": "KRX:000660",
};

// Liquid pairs FXCM quotes; everything else uses the FX_IDC composite, which
// carries virtually every ISO currency pair (CNH, KRW, IDR, TWD, ...).
const FX_MAJORS = new Set(["EURUSD", "USDJPY", "GBPUSD", "USDCAD", "USDCHF", "AUDUSD", "NZDUSD"]);

// Venue per crypto base, resolved against TradingView's symbol-search API
// (2026-07-30) — the aggregate CRYPTO index only carries majors, so charting
// everything through it left most alts with "symbol doesn't exist". Coinbase
// covers nearly the whole Avantis listing; the handful it lacks chart on the
// venue TradingView actually serves them from.
const CRYPTO_VENUE: Record<string, string> = {
  DYM: "CRYPTO:DYMUSD",
  ORDI: "CRYPTO:ORDIUSD",
  JUP: "OKX:JUPUSD",
  BRETT: "PYTH:BRETTUSD",
  GOAT: "OKX:GOATUSD",
  CHILLGUY: "CRYPTO:CHILLGUYUSD",
  XMR: "CRYPTO:XMRUSD",
  LIT: "CRYPTO:LITUSD",
};

export function tradingViewSymbol(pair: PerpPair): string {
  const symbol = `${pair.from}/${pair.to}`;
  const override = OVERRIDES[symbol];
  if (override) return override;
  if (pair.category === "forex") {
    const flat = `${pair.from}${pair.to}`;
    return FX_MAJORS.has(flat) ? `FX:${flat}` : `FX_IDC:${flat}`;
  }
  if (pair.category === "equities") return `NASDAQ:${pair.from}`;
  return CRYPTO_VENUE[pair.from] ?? `COINBASE:${pair.from}USD`;
}

// For the moment before the pair config has loaded (or the preview pairs),
// chart the base symbol as crypto.
export function tradingViewFallbackSymbol(baseSym: string): string {
  return CRYPTO_VENUE[baseSym] ?? `COINBASE:${baseSym}USD`;
}
