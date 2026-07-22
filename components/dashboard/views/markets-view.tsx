"use client";

import { useState } from "react";
import { CoinBadge } from "@/components/ui/coin-badge";
import { MARKETS, MARKET_CLASS_MAP, MARKET_TABS } from "@/lib/data/dashboard";
import { isUp, parseMoney } from "@/lib/format";
import type { ConfirmPayload, DetailPayload } from "@/components/dashboard/modal-types";
import type { Market } from "@/lib/types";

interface MarketsViewProps {
  onOpenDetail: (detail: DetailPayload) => void;
  onOpenConfirm: (confirm: ConfirmPayload) => void;
}

export function MarketsView({ onOpenDetail, onOpenConfirm }: MarketsViewProps) {
  const [cat, setCat] = useState<(typeof MARKET_TABS)[number]>("All");
  const rows = MARKETS.filter((m) => cat === "All" || m.class === MARKET_CLASS_MAP[cat]);

  const buyConfirm = (m: Market): ConfirmPayload => ({
    eyebrow: "// Trade",
    badgeSym: m.sym,
    badgeBg: m.bg,
    title: `Buy ${m.name}`,
    sub: `${m.ticker} · ${m.class}`,
    lines: [
      { k: "You pay", v: "$500.00" },
      {
        k: "You receive",
        v: `${(500 / parseMoney(m.price)).toFixed(4)} ${m.ticker}`,
        c: "#A78BFA",
      },
      { k: "Price", v: m.price },
      { k: "Fee", v: "$0.00 · no commission", c: "#7CE7B0" },
    ],
    cta: `Buy ${m.ticker}`,
    successTitle: "Order filled",
    successMsg: `You now own ${m.ticker}. It's live in your portfolio.`,
  });

  const openMarket = (m: Market) =>
    onOpenDetail({
      sym: m.sym,
      name: m.name,
      sub: `${m.ticker} · ${m.class}`,
      price: m.price,
      chg: m.chg,
      bg: m.bg,
      stats: [
        { k: "Price", v: m.price },
        { k: "24h change", v: m.chg },
        { k: "Asset class", v: m.class },
        { k: "Ticker", v: m.ticker },
      ],
      cta: `Buy ${m.name}`,
      onCta: () => onOpenConfirm(buyConfirm(m)),
    });

  return (
    <div className="max-w-[1180px] p-4 sm:p-7">
      <div className="text-[13px] font-normal text-white/55">{"// Markets"}</div>
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
        {rows.map((m) => (
          <div
            key={m.ticker}
            onClick={() => openMarket(m)}
            className="grid cursor-pointer grid-cols-[1.7fr_1fr_auto] items-center gap-3.5 border-t border-white/6 px-4 py-3.5 transition-colors hover:bg-white/4 min-[560px]:grid-cols-[2fr_1fr_1fr_1.2fr_0.8fr] sm:px-6"
          >
            <div className="flex items-center gap-3">
              <CoinBadge sym={m.sym} bg={m.bg} />
              <div>
                <div className="font-sans text-[14.5px] font-medium">{m.name}</div>
                <div className="text-xs text-white/50">{m.ticker}</div>
              </div>
            </div>
            <span className="tnum text-right text-sm">{m.price}</span>
            <span
              className={`tnum hidden text-right text-[13.5px] min-[560px]:block ${isUp(m.chg) ? "text-up" : "text-down"}`}
            >
              {m.chg}
            </span>
            <span className="hidden text-right text-[13px] text-white/60 min-[560px]:block">
              {m.class}
            </span>
            <span className="text-right">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenConfirm(buyConfirm(m));
                }}
                className="border-accent/30 bg-accent/14 text-accent hover:bg-accent/20 cursor-pointer rounded-full border px-[15px] py-[7px] font-sans text-[12.5px] font-medium whitespace-nowrap"
              >
                Trade
              </button>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
