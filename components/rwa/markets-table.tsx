"use client";

import { useState } from "react";
import { CoinBadge } from "@/components/ui/coin-badge";
import { RWA_ASSETS, RWA_TABS } from "@/lib/data/rwa";
import type { RwaAsset } from "@/lib/types";

interface MarketsTableProps {
  selectedKey: string;
  onOpenDetail: (asset: RwaAsset) => void;
  onBuy: (asset: RwaAsset) => void;
}

export function MarketsTable({ selectedKey, onOpenDetail, onBuy }: MarketsTableProps) {
  const [cat, setCat] = useState<(typeof RWA_TABS)[number]>("All");
  const rows = RWA_ASSETS.filter((a) => cat === "All" || a.cat === cat);

  return (
    <section className="mx-auto max-w-[1240px] px-4 pt-9 pb-[60px] sm:px-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3.5">
        <h2 className="ws-serif text-[28px] tracking-[-0.02em]">All markets</h2>
        <div className="flex flex-wrap gap-2">
          {RWA_TABS.map((t) => (
            <button
              key={t}
              onClick={() => setCat(t)}
              className={`cursor-pointer rounded-full border px-4 py-2 font-sans text-[13px] font-medium transition-colors ${
                cat === t
                  ? "border-accent/35 bg-accent/14 text-white"
                  : "border-white/10 bg-white/4 text-white/60 hover:text-white"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-[22px] border border-white/10 bg-white/4">
        <div className="grid grid-cols-[1.6fr_1fr_auto] gap-2 px-4 py-4 text-[11.5px] tracking-[0.04em] text-white/40 uppercase min-[720px]:grid-cols-[2.2fr_1fr_1fr_1.2fr_1fr_0.8fr] min-[720px]:gap-3 sm:px-[22px]">
          <span>Asset</span>
          <span className="text-right">Price</span>
          <span className="hidden text-right min-[720px]:block">24h</span>
          <span className="hidden text-right min-[720px]:block">Market cap</span>
          <span className="hidden text-right min-[720px]:block">Yield</span>
          <span />
        </div>
        {rows.map((a) => (
          <div
            key={a.key}
            onClick={() => onOpenDetail(a)}
            className={`grid cursor-pointer grid-cols-[1.6fr_1fr_auto] items-center gap-2 border-t border-white/6 px-4 py-3.5 transition-colors hover:bg-white/4 min-[720px]:grid-cols-[2.2fr_1fr_1fr_1.2fr_1fr_0.8fr] min-[720px]:gap-3 sm:px-[22px] ${
              a.key === selectedKey ? "bg-accent/8" : ""
            }`}
          >
            <div className="flex items-center gap-3">
              <CoinBadge sym={a.sym} bg={a.bg} />
              <div className="min-w-0">
                <div className="truncate font-sans text-[14.5px] font-medium">{a.name}</div>
                <div className="text-xs text-white/50">{a.ticker}</div>
              </div>
            </div>
            <span className="tnum text-right text-sm">{a.price}</span>
            <span
              className={`tnum hidden text-right text-[13.5px] min-[720px]:block ${a.up ? "text-up" : "text-down"}`}
            >
              {a.chg}
            </span>
            <span className="tnum hidden text-right text-[13.5px] text-white/75 min-[720px]:block">
              {a.mcap}
            </span>
            <span className="tnum text-up hidden text-right text-[13.5px] min-[720px]:block">
              {a.yield}
            </span>
            <span className="text-right">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onBuy(a);
                }}
                className="border-accent/30 bg-accent/14 text-accent hover:bg-accent/20 cursor-pointer rounded-full border px-4 py-[7px] font-sans text-[12.5px] font-semibold whitespace-nowrap"
              >
                Buy
              </button>
            </span>
          </div>
        ))}
      </div>
      <p className="mt-4 max-w-[80ch] text-xs text-white/35">
        Tokenized real-world assets carry risk, including loss of principal. Yields are variable and
        not guaranteed. Nothing here is financial advice. © 2026 World Street · RWA.
      </p>
    </section>
  );
}
