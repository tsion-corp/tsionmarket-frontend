"use client";

import { useState } from "react";
import { CoinBadge } from "@/components/ui/coin-badge";
import { CHART_DOWN_LINE, CHART_UP_LINE, RWA_RANGES } from "@/lib/data/rwa";
import { parseMoney } from "@/lib/format";
import type { RwaAsset } from "@/lib/types";

export function AssetHeader({ asset }: { asset: RwaAsset }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-3.5">
        <CoinBadge sym={asset.sym} bg={asset.bg} size={52} />
        <div>
          <div className="flex items-center gap-2.5">
            <span className="ws-serif text-[22px] tracking-[-0.01em] sm:text-[26px]">
              {asset.name}
            </span>
            <span className="rounded-full border border-white/12 bg-white/6 px-2.5 py-[3px] text-[11px] text-white/70">
              {asset.cat}
            </span>
          </div>
          <div className="mt-0.5 text-[13px] text-white/50">{asset.ticker} · backed 1:1</div>
        </div>
      </div>
      <div className="text-right">
        <div className="ws-serif tnum text-[32px] leading-none sm:text-[38px]">{asset.price}</div>
        <div className={`mt-1 text-sm ${asset.up ? "text-up" : "text-down"}`}>
          {asset.up ? "▲" : "▼"} {asset.chg} today
        </div>
      </div>
    </div>
  );
}

export function AssetChart({ asset }: { asset: RwaAsset }) {
  const [range, setRange] = useState<(typeof RWA_RANGES)[number]>("1M");
  const color = asset.up ? "#7CE7B0" : "#F6A5A5";
  const line = asset.up ? CHART_UP_LINE : CHART_DOWN_LINE;
  return (
    <div className="rounded-[22px] border border-white/10 bg-white/4 p-4 sm:p-[22px]">
      <div className="mb-2 flex justify-end gap-1.5">
        {RWA_RANGES.map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            className={`cursor-pointer rounded-lg px-3 py-1.5 font-sans text-xs font-medium transition-colors ${
              range === r
                ? "bg-accent/16 text-white"
                : "bg-transparent text-white/50 hover:text-white"
            }`}
          >
            {r}
          </button>
        ))}
      </div>
      <div className="relative h-[200px] sm:h-[260px]">
        <svg width="100%" height="100%" viewBox="0 0 600 260" preserveAspectRatio="none">
          <defs>
            <linearGradient id="rwa-chart" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={color} stopOpacity="0.35" />
              <stop offset="1" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={`${line} L600 260 L0 260 Z`} fill="url(#rwa-chart)" />
          <path d={line} fill="none" stroke={color} strokeWidth="2.5" />
        </svg>
      </div>
    </div>
  );
}

export function AssetStats({ asset }: { asset: RwaAsset }) {
  const volume = `$${(parseMoney(asset.mcap.replace("M", "")) * 0.14).toFixed(1)}M`;
  const stats = [
    { label: "Market cap", value: asset.mcap, color: "#fff" },
    { label: "24h volume", value: volume, color: "#fff" },
    { label: asset.yieldLabel, value: asset.yield, color: "#7CE7B0" },
    { label: "Backing", value: "1:1", color: "#A78BFA" },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 min-[560px]:grid-cols-4">
      {stats.map((s) => (
        <div key={s.label} className="rounded-2xl border border-white/10 bg-white/4 p-4">
          <div className="text-xs text-white/50">{s.label}</div>
          <div className="ws-serif tnum mt-1.5 text-[22px]" style={{ color: s.color }}>
            {s.value}
          </div>
        </div>
      ))}
    </div>
  );
}

export function AssetAbout({ asset }: { asset: RwaAsset }) {
  return (
    <div className="rounded-[22px] border border-white/10 bg-white/4 p-5 sm:p-6">
      <div className="ws-serif mb-3 text-[22px]">About {asset.name}</div>
      <p className="max-w-[70ch] text-[14.5px] leading-[1.6] text-white/78">{asset.about}</p>
      <div className="mt-[18px] flex flex-wrap gap-2.5">
        {asset.facts.map((f) => (
          <span
            key={f}
            className="inline-flex items-center gap-[7px] rounded-full border border-white/10 bg-white/5 px-[13px] py-2 text-[12.5px] text-white/80"
          >
            <span className="bg-accent h-1.5 w-1.5 rounded-full" />
            {f}
          </span>
        ))}
      </div>
    </div>
  );
}
