"use client";

import { CoinBadge } from "@/components/ui/coin-badge";
import { CHART_DOWN_LINE, CHART_UP_LINE } from "@/lib/data/rwa";
import type { RwaAsset } from "@/lib/types";

interface RwaDetailModalProps {
  asset: RwaAsset;
  onTrade: () => void;
}

export function RwaDetailModal({ asset, onTrade }: RwaDetailModalProps) {
  const color = asset.up ? "#7CE7B0" : "#F6A5A5";
  const line = asset.up ? CHART_UP_LINE : CHART_DOWN_LINE;
  const stats = [
    { k: "Price", v: asset.price },
    { k: "24h change", v: asset.chg },
    { k: "Market cap", v: asset.mcap },
    { k: asset.yieldLabel, v: asset.yield },
  ];
  return (
    <div>
      <div className="text-[13px] font-normal text-white/55">{"// Asset details"}</div>
      <div className="mt-3 flex items-center gap-[13px]">
        <CoinBadge sym={asset.sym} bg={asset.bg} size={44} />
        <div className="min-w-0 flex-1">
          <div className="ws-serif text-[23px] tracking-[-0.01em]">{asset.name}</div>
          <div className="text-[12.5px] text-white/50">
            {asset.ticker} · {asset.cat}
          </div>
        </div>
        <div className="text-right">
          <div className="ws-serif tnum text-[22px]">{asset.price}</div>
          <div className="text-[13px]" style={{ color }}>
            {asset.chg}
          </div>
        </div>
      </div>
      <div className="relative mt-4 h-[120px] overflow-hidden rounded-[14px] bg-[linear-gradient(180deg,rgba(167,139,250,0.1),rgba(167,139,250,0))]">
        <svg width="100%" height="100%" viewBox="0 0 600 260" preserveAspectRatio="none">
          <defs>
            <linearGradient id="rwa-detail" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={color} stopOpacity="0.3" />
              <stop offset="1" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={`${line} L600 260 L0 260 Z`} fill="url(#rwa-detail)" />
          <path d={line} fill="none" stroke={color} strokeWidth="3" />
        </svg>
      </div>
      <p className="mt-3.5 text-[13.5px] leading-[1.55] text-white/72">{asset.about}</p>
      <div className="mt-3.5 flex flex-col gap-[11px] text-[13.5px] text-white/60">
        {stats.map((s) => (
          <div key={s.k} className="flex justify-between">
            <span>{s.k}</span>
            <span className="text-white">{s.v}</span>
          </div>
        ))}
      </div>
      <button
        onClick={onTrade}
        className="text-ink mt-5 w-full cursor-pointer rounded-[14px] bg-white p-3.5 font-sans text-[15px] font-semibold hover:opacity-90"
      >
        Trade {asset.name}
      </button>
    </div>
  );
}
