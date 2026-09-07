"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { ListPagination } from "@/components/ui/list-pagination";
import { usePaged } from "@/hooks/use-paged";
import { MemeCoin, PctChange, RiskBadge, priceLabel } from "@/features/trade/components/meme-bits";
import { MemeSearchInput } from "@/features/trade/components/meme-search-input";
import { MemeUnavailable } from "@/features/trade/components/meme-unavailable";
import {
  RISK_FILTERS,
  RiskFilter,
  filterByRisk,
} from "@/features/trade/components/meme-risk-filter";
import { useMemeSearch, useTrendingMemes } from "@/features/trade/hooks/use-meme-tokens";
import type { MemeToken, TokenRiskLevel } from "@/lib/meme/api";

// Five, because a trending list is a shortlist. More than that and it stops
// being "what is moving" and becomes the table below it.
const PER_PAGE = 5;

// Trending memecoins: what is moving now, narrowed by risk band, with search
// across the whole catalogue rather than only this page.
export function MemeTrending({ onOpen }: { onOpen: (token: MemeToken) => void }) {
  const t = useTranslations("meme");
  const { tokens, isLoading, error, refetch } = useTrendingMemes();
  const [query, setQuery] = useState("");
  const search = useMemeSearch(query);
  const [bands, setBands] = useState<Set<TokenRiskLevel>>(new Set());

  // Searching replaces the trending list rather than filtering it: a search
  // that only looked at five coins would answer "no results" about a catalogue
  // it never asked.
  const source: MemeToken[] = search.active ? search.results : tokens;
  const rows = useMemo(() => filterByRisk(source, bands), [source, bands]);
  const paged = usePaged(rows, PER_PAGE);

  // Counted before filtering, so a chip says how many it would bring back
  // rather than how many survive a filter already applied.
  const counts = useMemo(() => {
    const m = new Map<TokenRiskLevel, number>();
    for (const level of RISK_FILTERS) m.set(level, 0);
    for (const token of source) m.set(token.riskLevel, (m.get(token.riskLevel) ?? 0) + 1);
    return m;
  }, [source]);

  const toggle = (level: TokenRiskLevel) =>
    setBands((prev) => {
      const next = new Set(prev);
      if (!next.delete(level)) next.add(level);
      return next;
    });

  const busy = search.active ? search.searching : isLoading;
  const failed = search.active ? !!search.error : !!error && tokens.length === 0;

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="ws-display text-[18px]">{t("trendingTitle")}</div>
        <MemeSearchInput value={query} onChange={setQuery} label={t("searchTrendingLabel")} />
      </div>

      <div className="mt-3">
        <RiskFilter
          active={bands}
          onToggle={toggle}
          onClear={() => setBands(new Set())}
          counts={counts}
        />
      </div>

      <div className="mt-3 flex flex-col gap-2">
        {failed ? (
          <MemeUnavailable onRetry={search.active ? () => setQuery("") : () => void refetch()} />
        ) : busy ? (
          Array.from({ length: PER_PAGE }, (_, i) => (
            <div key={i} className="h-[68px] animate-pulse rounded-[14px] bg-white/6" />
          ))
        ) : rows.length === 0 ? (
          <div className="ws-card grid place-items-center px-4 py-12 text-center text-[13px] font-normal text-white/45">
            {search.active ? t("noResults") : bands.size > 0 ? t("noneInBands") : t("empty")}
          </div>
        ) : (
          paged.pageItems.map((token) => (
            <button
              key={`${token.chainId}:${token.address}`}
              onClick={() => onOpen(token)}
              className="ws-card hover:border-accent/50 flex w-full cursor-pointer items-center gap-3 rounded-[14px] p-3 text-left transition-colors sm:gap-4 sm:p-4"
            >
              <MemeCoin token={token} size={36} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-sans text-[14px] font-semibold">
                  {token.symbol ?? "?"}
                </div>
                <div className="truncate text-[11.5px] font-normal text-white/45">
                  {token.name ?? "—"}
                </div>
              </div>
              <div className="hidden shrink-0 sm:block">
                <RiskBadge level={token.riskLevel} />
              </div>
              <div className="shrink-0 text-right">
                <div className="tnum text-[14px] font-medium">{priceLabel(token.priceUsd)}</div>
                <div className="text-[11.5px]">
                  <PctChange value={token.priceChange24hPercent} />
                </div>
              </div>
            </button>
          ))
        )}
      </div>

      {!busy && !failed && rows.length > PER_PAGE ? (
        <ListPagination
          page={paged.page + 1}
          pages={paged.pageCount}
          onPage={(p) => (p > paged.page + 1 ? paged.goNext() : paged.goPrev())}
        />
      ) : null}
    </section>
  );
}
