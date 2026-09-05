"use client";

import { useLocale } from "next-intl";

// TradingView's advanced chart, embedded as a plain iframe: no third-party
// script in our bundle, and a symbol change swaps the frame via `key` instead
// of re-driving a widget API. Dark theme to match the app; TradingView speaks
// all five app locales.

const TV_LOCALE: Record<string, string> = {
  en: "en",
  fr: "fr",
  de: "de_DE",
  es: "es",
  pt: "br",
};

interface TradingViewChartProps {
  symbol: string;
  height?: number | string;
  /** TradingView interval code — "1"/"5"/"15"/"60"/"240"/"D"/"W"/"M". */
  interval?: string;
}

export function TradingViewChart({ symbol, height = 380, interval = "60" }: TradingViewChartProps) {
  const locale = useLocale();
  const params = new URLSearchParams({
    symbol,
    interval,
    theme: "dark",
    style: "1",
    locale: TV_LOCALE[locale] ?? "en",
    saveimage: "0",
    withdateranges: "1",
    allow_symbol_change: "0",
    // Explicit, not left to default: TradingView's own widget generator
    // always sends these even at their default values, and a bare iframe
    // hit directly (bypassing their tv.js loader) does NOT reliably fall
    // back the same way — omitting them is what was hiding the left
    // drawing-tools toolbar and the top indicators/screenshot toolbar.
    hide_side_toolbar: "0",
    hide_top_toolbar: "0",
    enable_publishing: "0",
    studies_overrides: "{}",
  });
  return (
    <iframe
      key={symbol}
      src={`https://s.tradingview.com/widgetembed/?${params.toString()}`}
      title={symbol}
      loading="lazy"
      className="w-full rounded-xl border-0 bg-black/20"
      style={{ height }}
    />
  );
}
