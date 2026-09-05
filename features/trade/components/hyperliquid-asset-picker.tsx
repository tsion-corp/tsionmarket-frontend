"use client";

import { useMemo, useState } from "react";
import { AssetIcon } from "@/components/ui/asset-icon";
import { SearchIcon } from "@/components/ui/icons";
import { FlashPrice } from "@/features/trade/components/flash-price";
import { formatCompactUsd, formatUsd } from "@/lib/trade/math";
import { tokenBg } from "@/lib/trade/assets";
import {
  hlPairLabel,
  type HlAsset,
  type HlMarketContext,
} from "@/features/trade/lib/hyperliquid-types";

interface HyperliquidAssetPickerProps {
  assets: HlAsset[];
  prices: Record<string, string>;
  contexts: HlMarketContext[];
  selected: string;
  onSelect: (symbol: string) => void;
  loading: boolean;
  /** Renders as a bare trigger (no card chrome, no trailing price) so it can
   *  sit inline inside HyperliquidMarketHeader's own stats row instead of
   *  as its own standalone card above the chart. */
  compact?: boolean;
  /** Real measured width of the chart column (compact mode only) — the
   *  dropdown matches it instead of a fixed guessed width. */
  dropdownWidth?: number;
}

interface MarketRow {
  asset: HlAsset;
  price: number;
  changePct: number | null;
  fundingPct: number | null;
  volumeUsd: number | null;
  openInterestUsd: number | null;
}

// Fixed display order — native crypto first (the original, always-present
// market), then HIP-3 categories roughly by how common they are, "other"
// last as the catch-all. A category only gets a tab when at least one
// synced asset actually has it, so this list quietly does nothing until
// HIP-3 dexs are configured (PERPS_HIP3_DEXS).
const CATEGORY_LABELS: Record<string, string> = {
  crypto: "Crypto",
  // TEMPORARY ROLLOUT GATE — HIP-3 categories are hidden until verified for
  // release. Re-enable each label here together with its entry in
  // RELEASED_CATEGORIES (use-hyperliquid-markets.ts), which is the actual
  // gate; these labels only control which tabs can render.
  // equities: "Equities",
  // forex: "Forex",
  // commodities: "Commodities",
  // indices: "Indices",
  // other: "Other",
};
const CATEGORY_ORDER = Object.keys(CATEGORY_LABELS);

// Header-as-trigger with a searchable market list underneath — the list
// itself is the same Market/Last Price/24h Change/Funding/Volume/Open
// Interest table Hyperliquid's own pro UI shows, sourced from
// use-hyperliquid-market-contexts.ts (one metaAndAssetCtxs call for every
// asset). Sorted by volume, matching Hyperliquid's own default.
export function HyperliquidAssetPicker({
  assets,
  prices,
  contexts,
  selected,
  onSelect,
  loading,
  compact = false,
  dropdownWidth,
}: HyperliquidAssetPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("all");

  const availableCategories = useMemo(() => {
    const present = new Set(assets.map((a) => a.category ?? "other"));
    return CATEGORY_ORDER.filter((c) => present.has(c));
  }, [assets]);

  const contextBySymbol = useMemo(() => {
    const map = new Map<string, HlMarketContext>();
    for (const ctx of contexts) map.set(ctx.symbol, ctx);
    return map;
  }, [contexts]);

  const asset = assets.find((a) => a.symbol === selected) ?? assets[0] ?? null;
  const mark = asset ? Number(prices[asset.symbol] ?? 0) : 0;

  const rows = useMemo(() => {
    const built: MarketRow[] = assets.map((a) => {
      const ctx = contextBySymbol.get(a.symbol);
      const price = ctx ? Number(ctx.markPrice) : Number(prices[a.symbol] ?? 0);
      const changePct =
        ctx && Number(ctx.prevDayPrice) > 0
          ? ((Number(ctx.markPrice) - Number(ctx.prevDayPrice)) / Number(ctx.prevDayPrice)) * 100
          : null;
      return {
        asset: a,
        price,
        changePct,
        fundingPct: ctx ? Number(ctx.fundingRate) * 100 : null,
        volumeUsd: ctx ? Number(ctx.dayVolumeUsd) : null,
        openInterestUsd: ctx && price > 0 ? Number(ctx.openInterest) * price : null,
      };
    });
    const byCategory =
      category === "all" ? built : built.filter((r) => (r.asset.category ?? "other") === category);
    const q = search.trim().toLowerCase();
    const filtered = q
      ? byCategory.filter((r) => r.asset.symbol.toLowerCase().includes(q))
      : byCategory;
    return filtered.sort((a, b) => (b.volumeUsd ?? 0) - (a.volumeUsd ?? 0));
  }, [assets, contextBySymbol, prices, search, category]);

  const pick = (symbol: string) => {
    onSelect(symbol);
    setOpen(false);
    setSearch("");
  };

  return (
    <div className={compact ? "relative" : "ws-card relative p-4 sm:p-5"}>
      <div className="flex items-center gap-3">
        <AssetIcon
          sym={asset?.symbol ?? "?"}
          bg={tokenBg(asset?.symbol ?? "?")}
          size={compact ? 28 : 34}
          fallback="gradient"
        />
        <button
          onClick={() => setOpen((v) => !v)}
          disabled={assets.length === 0}
          className="flex min-w-0 cursor-pointer items-center gap-2 text-left disabled:cursor-default"
        >
          {compact ? (
            <div className="flex items-center gap-1.5 font-sans text-[17px] font-semibold whitespace-nowrap">
              {asset ? hlPairLabel(asset.symbol) : loading ? "Loading…" : "No markets"}
              {assets.length > 0 ? <span className="text-white/40">▾</span> : null}
            </div>
          ) : (
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 font-sans text-[16px] font-semibold">
                {asset ? hlPairLabel(asset.symbol) : loading ? "Loading markets…" : "No markets"}
                {assets.length > 0 ? <span className="text-white/40">▾</span> : null}
              </div>
              <div className="truncate text-xs font-normal text-white/50">
                {asset ? `${asset.maxLeverage}x max leverage` : "—"}
              </div>
            </div>
          )}
        </button>
        {compact ? null : (
          <div className="ml-auto text-right">
            <FlashPrice value={mark} className="ws-display tnum block text-[19px]">
              {mark > 0 ? formatUsd(mark) : "—"}
            </FlashPrice>
          </div>
        )}
      </div>

      {open ? (
        <div
          style={compact && dropdownWidth ? { width: dropdownWidth } : undefined}
          className={`bg-panel absolute top-full z-20 mt-2 overflow-hidden rounded-2xl border border-white/12 shadow-[0_28px_70px_-24px_rgba(0,0,0,0.9)] ${
            compact ? `left-0 max-w-[90vw] ${dropdownWidth ? "" : "w-[600px]"}` : "inset-x-4"
          }`}
        >
          <div className="flex items-center gap-2 border-b border-white/8 px-3.5 py-2.5">
            <SearchIcon />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search markets"
              autoFocus
              className="min-w-0 flex-1 bg-transparent text-[13.5px] font-normal text-white outline-none"
            />
          </div>
          {availableCategories.length > 1 ? (
            <div className="flex items-center gap-1.5 overflow-x-auto border-b border-white/8 px-3.5 py-2">
              <button
                onClick={() => setCategory("all")}
                className={`shrink-0 cursor-pointer rounded-full px-2.5 py-1 text-[11.5px] font-medium transition-colors ${
                  category === "all"
                    ? "bg-white/14 text-white"
                    : "text-white/50 hover:text-white/80"
                }`}
              >
                All
              </button>
              {availableCategories.map((c) => (
                <button
                  key={c}
                  onClick={() => setCategory(c)}
                  className={`shrink-0 cursor-pointer rounded-full px-2.5 py-1 text-[11.5px] font-medium transition-colors ${
                    category === c ? "bg-white/14 text-white" : "text-white/50 hover:text-white/80"
                  }`}
                >
                  {CATEGORY_LABELS[c] ?? c}
                </button>
              ))}
            </div>
          ) : null}
          <div className="overflow-x-auto">
            <div className="min-w-[560px]">
              <div className="grid grid-cols-[1.6fr_1fr_1fr_0.9fr_1fr_1fr] gap-2 px-3.5 py-2 text-[10.5px] font-normal text-white/40">
                <span>Market</span>
                <span className="text-right">Last Price</span>
                <span className="text-right">24h Change</span>
                <span className="text-right">Funding</span>
                <span className="text-right">Volume</span>
                <span className="text-right">Open Interest</span>
              </div>
              <div className="max-h-[320px] overflow-y-auto">
                {rows.length === 0 ? (
                  <div className="px-4 py-6 text-center text-[13px] font-normal text-white/40">
                    No matches
                  </div>
                ) : (
                  rows.slice(0, 100).map((row) => (
                    <button
                      key={row.asset.id}
                      onClick={() => pick(row.asset.symbol)}
                      className="grid w-full cursor-pointer grid-cols-[1.6fr_1fr_1fr_0.9fr_1fr_1fr] items-center gap-2 px-3.5 py-2.5 text-left transition-colors hover:bg-white/6"
                    >
                      <span className="flex min-w-0 items-center gap-2.5">
                        <AssetIcon
                          sym={row.asset.symbol}
                          bg={tokenBg(row.asset.symbol)}
                          size={22}
                          fallback="gradient"
                        />
                        <span className="truncate font-sans text-[13px] font-medium">
                          {hlPairLabel(row.asset.symbol)}
                        </span>
                      </span>
                      <span className="tnum text-right text-[12.5px]">
                        {row.price > 0 ? formatUsd(row.price) : "—"}
                      </span>
                      <span
                        className={`tnum text-right text-[12.5px] ${
                          row.changePct == null
                            ? "text-white/40"
                            : row.changePct >= 0
                              ? "text-up"
                              : "text-down"
                        }`}
                      >
                        {row.changePct != null
                          ? `${row.changePct >= 0 ? "+" : ""}${row.changePct.toFixed(2)}%`
                          : "—"}
                      </span>
                      <span
                        className={`tnum text-right text-[12px] ${
                          row.fundingPct == null
                            ? "text-white/40"
                            : row.fundingPct >= 0
                              ? "text-up"
                              : "text-down"
                        }`}
                      >
                        {row.fundingPct != null ? `${row.fundingPct.toFixed(4)}%` : "—"}
                      </span>
                      <span className="tnum text-right text-[12.5px] text-white/70">
                        {row.volumeUsd != null ? formatCompactUsd(row.volumeUsd) : "—"}
                      </span>
                      <span className="tnum text-right text-[12.5px] text-white/70">
                        {row.openInterestUsd != null ? formatCompactUsd(row.openInterestUsd) : "—"}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
