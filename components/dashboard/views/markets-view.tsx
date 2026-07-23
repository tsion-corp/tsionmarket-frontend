"use client";

import { useState } from "react";
import { AssetIcon } from "@/components/ui/asset-icon";
import { Eyebrow } from "@/components/ui/eyebrow";
import { MARKET_TABS, useMarkets, type MarketRow, type MarketTab } from "@/hooks/use-markets";
import { formatUsd } from "@/lib/trade/math";
import type { ConfirmPayload, DetailPayload } from "@/components/dashboard/modal-types";

interface MarketsViewProps {
  onOpenDetail: (detail: DetailPayload) => void;
  onOpenConfirm: (confirm: ConfirmPayload) => void;
}

const DEFAULT_BUY_USD = 500;

function buyConfirm(row: MarketRow): ConfirmPayload {
  const receive = row.priceUsd > 0 ? DEFAULT_BUY_USD / row.priceUsd : 0;
  return {
    eyebrow: "Trade",
    badgeSym: row.symbol,
    badgeBg: row.bg,
    badgeLogo: row.logo,
    title: `Buy ${row.name}`,
    sub: `${row.ticker} · ${row.category}`,
    lines: [
      { k: "You pay", v: formatUsd(DEFAULT_BUY_USD) },
      {
        k: "You receive",
        v: `${receive.toLocaleString(undefined, { maximumFractionDigits: 4 })} ${row.ticker}`,
        c: "#A78BFA",
      },
      { k: "Price", v: row.hasData ? formatUsd(row.priceUsd) : "—" },
      { k: "Fee", v: "$0.00 · no commission", c: "#7CE7B0" },
    ],
    cta: `Buy ${row.ticker}`,
    successTitle: "Order filled",
    successMsg: `You now own ${row.ticker}. It's live in your portfolio.`,
  };
}

export function MarketsView({ onOpenDetail, onOpenConfirm }: MarketsViewProps) {
  const { rows, error } = useMarkets();
  const [cat, setCat] = useState<MarketTab>("All");
  const visible = rows.filter((row) => cat === "All" || row.category === cat);

  const openMarket = (row: MarketRow) =>
    onOpenDetail({
      sym: row.symbol,
      name: row.name,
      sub: `${row.ticker} · ${row.category}`,
      price: row.priceLabel,
      chg: row.change24hLabel,
      bg: row.bg,
      coingeckoId: row.coingeckoId,
      up: row.up,
      logo: row.logo,
      stats: [
        { k: "Price", v: row.priceLabel },
        { k: "24h change", v: row.change24hLabel },
        { k: "Asset class", v: row.category },
        { k: "Ticker", v: row.ticker },
      ],
      cta: `Buy ${row.name}`,
      onCta: () => onOpenConfirm(buyConfirm(row)),
    });

  return (
    <div className="mx-auto w-full max-w-[1520px] p-4 sm:p-6 lg:p-8">
      <Eyebrow>Markets</Eyebrow>
      <div className="mt-3.5 flex flex-wrap gap-2">
        {MARKET_TABS.map((t) => (
          <button
            key={t}
            onClick={() => setCat(t)}
            className={`cursor-pointer rounded-full border px-[18px] py-[9px] font-sans text-[13.5px] font-medium transition-colors ${
              cat === t
                ? "border-accent/30 bg-accent/14 text-white"
                : "border-white/10 bg-white/4 text-white/65 hover:text-white"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="ws-card mt-4 overflow-hidden">
        <div className="grid grid-cols-[1.7fr_1fr_auto] gap-3.5 px-4 py-4 text-[11.5px] tracking-[0.04em] text-white/40 uppercase min-[560px]:grid-cols-[2fr_1fr_1fr_1.2fr_0.8fr] sm:px-6">
          <span>Market</span>
          <span className="text-right">Price</span>
          <span className="hidden text-right min-[560px]:block">24h</span>
          <span className="hidden text-right min-[560px]:block">Class</span>
          <span />
        </div>

        {error && rows.every((row) => !row.hasData) ? (
          <div className="border-t border-white/6 px-6 py-8 text-center text-[13.5px] font-normal text-white/45">
            Live market prices are unavailable right now. Please try again shortly.
          </div>
        ) : (
          visible.map((row) => (
            <div
              key={row.symbol}
              onClick={() => openMarket(row)}
              className="grid cursor-pointer grid-cols-[1.7fr_1fr_auto] items-center gap-3.5 border-t border-white/6 px-4 py-3.5 transition-colors hover:bg-white/4 min-[560px]:grid-cols-[2fr_1fr_1fr_1.2fr_0.8fr] sm:px-6"
            >
              <div className="flex items-center gap-3">
                <AssetIcon sym={row.symbol} bg={row.bg} logo={row.logo} />
                <div>
                  <div className="font-sans text-[14.5px] font-medium">{row.name}</div>
                  <div className="text-xs font-normal text-white/50">{row.ticker}</div>
                </div>
              </div>
              <span className="tnum text-right text-sm font-normal">{row.priceLabel}</span>
              <span
                className={`tnum hidden text-right text-[13.5px] font-normal min-[560px]:block ${
                  row.hasData ? (row.up ? "text-up" : "text-down") : "text-white/40"
                }`}
              >
                {row.change24hLabel}
              </span>
              <span className="hidden text-right text-[13px] font-normal text-white/60 min-[560px]:block">
                {row.category}
              </span>
              <span className="text-right">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenConfirm(buyConfirm(row));
                  }}
                  className="border-accent/30 bg-accent/14 text-accent hover:bg-accent/20 cursor-pointer rounded-full border px-[15px] py-[7px] font-sans text-[12.5px] font-medium whitespace-nowrap"
                >
                  Trade
                </button>
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
