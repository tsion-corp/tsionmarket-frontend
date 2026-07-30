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
  height?: number;
}

export function TradingViewChart({ symbol, height = 380 }: TradingViewChartProps) {
  const locale = useLocale();
  const params = new URLSearchParams({
    symbol,
    interval: "60",
    theme: "dark",
    style: "1",
    locale: TV_LOCALE[locale] ?? "en",
    hidelegend: "1",
    saveimage: "0",
    withdateranges: "1",
    allow_symbol_change: "0",
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
