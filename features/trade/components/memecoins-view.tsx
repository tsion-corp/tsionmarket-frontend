"use client";

import { useCallback, useMemo, useState } from "react";
import { MemeCoin, priceLabel } from "@/features/trade/components/meme-bits";
import { MemecoinPromos } from "@/features/trade/components/memecoin-promos";
import { MemeTradeSheet } from "@/features/trade/components/meme-trade-sheet";
import { useTrendingMemes } from "@/features/trade/hooks/use-meme-tokens";
import type { MemeToken } from "@/lib/meme/api";

// The filter chips as the comp draws them (node 280:6971). "All" is the raw
// trending order; the rest re-sort the same live list so a tap always has an
// effect rather than being decorative.
const FILTERS = ["All", "New", "Gainers", "Losers", "Hot"] as const;
type Filter = (typeof FILTERS)[number];

// Short chain tag for a token's pair line (PEPE/SOL). Only the chains the meme
// desk actually sources from; an unknown chain drops the suffix rather than
// print a guess.
const CHAIN_TAG: Record<number, string> = {
  1: "ETH",
  10: "OP",
  56: "BSC",
  137: "POLY",
  8453: "BASE",
  42161: "ARB",
  101: "SOL",
  1399811149: "SOL",
};

const GREEN = "#0ecb81";
const RED = "#d93025";

function pctOf(value: string | null): number {
  const n = value === null ? NaN : Number(value);
  return Number.isFinite(n) ? n : NaN;
}

// Volume in the comp's compact dollar form ($84.2M, $182.9M).
function compactUsd(value: string | null): string {
  const n = value === null ? NaN : Number(value);
  if (!Number.isFinite(n) || n <= 0) return "—";
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

function pairLabel(token: MemeToken): string {
  const sym = token.symbol ?? "?";
  const tag = CHAIN_TAG[token.chainId];
  return tag ? `${sym}/${tag}` : sym;
}

// The colored change pill on a trending card: a tinted background at the comp's
// low opacity with the matching solid text.
function TrendPill({ value }: { value: string | null }) {
  const n = pctOf(value);
  if (!Number.isFinite(n)) {
    return (
      <span className="rounded-[6px] bg-white/6 px-1.5 py-0.5 text-[10px] font-semibold text-white/40">
        —
      </span>
    );
  }
  const up = n >= 0;
  return (
    <span
      className="rounded-[6px] px-1.5 py-0.5 text-[10px] font-semibold"
      style={{
        color: up ? GREEN : RED,
        backgroundColor: up ? "rgba(14,203,129,0.1)" : "rgba(217,48,37,0.1)",
      }}
    >
      {up ? "+" : ""}
      {n.toFixed(1)}%
    </span>
  );
}

// One trending card: the token image, its change pill, the symbol, and the
// price, in the comp's tight column (node 280:6971).
function TrendCard({ token, onOpen }: { token: MemeToken; onOpen: (t: MemeToken) => void }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(token)}
      className="flex flex-1 cursor-pointer flex-col rounded-[16px] border border-white/[0.04] bg-white/5 p-3 text-left transition-colors hover:border-white/10"
    >
      <div className="flex items-center justify-between">
        <span className="overflow-hidden rounded-[3px]">
          <MemeCoin token={token} size={28} />
        </span>
        <TrendPill value={token.priceChange24hPercent} />
      </div>
      <span className="mt-2 truncate text-[14px] leading-none font-semibold text-white">
        {token.symbol ?? "?"}
      </span>
      <span className="tnum mt-1.5 truncate text-[11px] leading-none text-white/50">
        {priceLabel(token.priceUsd)}
      </span>
    </button>
  );
}

// One table row: the token identity on the left, then price, 24h change, and
// volume right-aligned across the comp's four columns.
function TableRow({ token, onOpen }: { token: MemeToken; onOpen: (t: MemeToken) => void }) {
  const chg = pctOf(token.priceChange24hPercent);
  const hasChg = Number.isFinite(chg);
  return (
    <button
      type="button"
      onClick={() => onOpen(token)}
      className="grid cursor-pointer grid-cols-[minmax(0,1fr)_84px_66px_58px] items-center border-t border-white/5 px-1 py-2 text-left transition-colors hover:bg-white/4"
    >
      <span className="flex min-w-0 items-center gap-2">
        <span className="shrink-0 overflow-hidden rounded-[3px]">
          <MemeCoin token={token} size={25} />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[12.5px] leading-tight font-semibold text-white">
            {token.name ?? token.symbol ?? "—"}
          </span>
          <span className="block truncate text-[10px] leading-tight text-white/30">
            {pairLabel(token)}
          </span>
        </span>
      </span>
      <span className="tnum truncate text-right text-[11.5px] text-white">
        {priceLabel(token.priceUsd)}
      </span>
      <span
        className="tnum text-right text-[11.5px]"
        style={{ color: hasChg ? (chg >= 0 ? GREEN : RED) : "rgba(255,255,255,0.4)" }}
      >
        {hasChg ? `${chg >= 0 ? "+" : ""}${chg.toFixed(2)}%` : "—"}
      </span>
      <span className="tnum truncate text-right text-[11.5px] text-white/50">
        {compactUsd(token.volume24hUsd)}
      </span>
    </button>
  );
}

// The Memecoins tab body from the comp (node 280:6971): a trending strip of
// three cards, a row of filter chips, and the full token table. Wired to the
// live trending feed, and a tap opens the app's real meme trade sheet.
export function MemecoinsView() {
  const { tokens, isLoading, error } = useTrendingMemes();
  const [filter, setFilter] = useState<Filter>("All");
  const [selected, setSelected] = useState<MemeToken | null>(null);

  const trending = tokens.slice(0, 3);

  // A promo card names a token symbol; open its trade sheet when that token is
  // in the live feed, otherwise the tap is a no-op rather than a broken link.
  const openSymbol = useCallback(
    (symbol: string) => {
      const match = tokens.find((t) => (t.symbol ?? "").toUpperCase() === symbol.toUpperCase());
      if (match) setSelected(match);
    },
    [tokens]
  );

  // The chips re-order the same live list. "New" keeps the feed's own order,
  // which already leads with freshly trending tokens.
  const rows = useMemo(() => {
    const list = [...tokens];
    const chg = (t: MemeToken) => pctOf(t.priceChange24hPercent);
    const vol = (t: MemeToken) => Number(t.volume24hUsd ?? "0") || 0;
    switch (filter) {
      case "Gainers":
        return list
          .filter((t) => Number.isFinite(chg(t)) && chg(t) > 0)
          .sort((a, b) => chg(b) - chg(a));
      case "Losers":
        return list
          .filter((t) => Number.isFinite(chg(t)) && chg(t) < 0)
          .sort((a, b) => chg(a) - chg(b));
      case "Hot":
        return list.sort((a, b) => vol(b) - vol(a));
      case "New":
      case "All":
      default:
        return list;
    }
  }, [tokens, filter]);

  return (
    <div className="flex flex-col gap-6">
      {/* Section header: "Find the next 100X >" */}
      <div className="flex items-center gap-[3px]">
        <span className="ws-display text-[16px] leading-[1.1] tracking-[-0.32px] text-white">
          Find the next <span className="tracking-[-0.64px] text-[#ddb4fd]">100X</span>
        </span>
        <svg viewBox="0 0 20 20" aria-hidden className="h-5 w-5 shrink-0" fill="none">
          <path
            d="M7.5 4l6 6-6 6"
            stroke="white"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      {/* Featured promo banners */}
      <MemecoinPromos onOpenSymbol={openSymbol} />

      {/* Trending strip */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-1.5">
          <span className="text-[13px] font-semibold tracking-[0.04em] text-white/50 uppercase">
            Trending
          </span>
          <span className="text-[14px] leading-none">🔥</span>
        </div>
        {isLoading ? (
          <div className="flex gap-2.5">
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="h-[92px] flex-1 animate-pulse rounded-[16px] bg-white/6" />
            ))}
          </div>
        ) : trending.length > 0 ? (
          <div className="flex gap-2.5">
            {trending.map((token) => (
              <TrendCard key={token.address} token={token} onOpen={setSelected} />
            ))}
          </div>
        ) : null}
      </section>

      {/* Filter chips */}
      <div className="ws-no-scrollbar flex gap-2 overflow-x-auto">
        {FILTERS.map((f) => {
          const on = f === filter;
          return (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`shrink-0 cursor-pointer rounded-full px-4 py-2 text-[13px] font-semibold transition-colors ${
                on ? "bg-white text-black" : "border border-white/6 bg-white/5 text-white/50"
              }`}
            >
              {f}
            </button>
          );
        })}
      </div>

      {/* Token table */}
      <section>
        <div className="grid grid-cols-[minmax(0,1fr)_84px_66px_58px] px-1 pb-1 text-[10px] font-semibold text-white/30">
          <span>Token</span>
          <span className="text-right">Price</span>
          <span className="text-right">24h Chg</span>
          <span className="text-right">Vol</span>
        </div>
        {isLoading ? (
          <div className="flex flex-col">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="h-[44px] border-t border-white/5" />
            ))}
          </div>
        ) : error || rows.length === 0 ? (
          <div className="grid place-items-center py-14 text-center text-[13px] font-normal text-white/45">
            {error ? "Memecoins are unavailable right now." : "No memecoins to show."}
          </div>
        ) : (
          <div className="flex flex-col">
            {rows.map((token) => (
              <TableRow key={token.address} token={token} onOpen={setSelected} />
            ))}
          </div>
        )}
      </section>

      {selected ? (
        <MemeTradeSheet token={selected} onClose={() => setSelected(null)} showRisk />
      ) : null}
    </div>
  );
}
