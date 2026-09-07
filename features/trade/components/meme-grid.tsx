"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { ListPagination } from "@/components/ui/list-pagination";
import { MemeCoin, PctChange, RiskBadge, priceLabel } from "@/features/trade/components/meme-bits";
import { MemeSearchInput } from "@/features/trade/components/meme-search-input";
import { MemeFilterButton } from "@/features/trade/components/meme-filter-button";
import { MemeUnavailable } from "@/features/trade/components/meme-unavailable";
import { RISK_FILTERS, filterByRisk } from "@/features/trade/components/meme-risk-filter";
import { usePaged } from "@/hooks/use-paged";
import { useMemeCatalog, useMemeSearch } from "@/features/trade/hooks/use-meme-tokens";
import { compactUsd, type MemeToken, type TokenRiskLevel } from "@/lib/meme/api";

// Twenty-one: seven rows of three on a wide screen, and it divides evenly by
// the two- and one-column layouts too, so no page ends in a ragged row.
const PER_PAGE = 21;

// The catalogue is fetched in one request and paged here rather than on the
// server. Paging on the server put the boundary filter after the page was
// cut, so a page holding a dropped row came back short and the last row was
// ragged; filtering first and cutting after is the only way a page is
// reliably full. It also makes the risk bands mean what
// they look like they mean: they narrow the whole catalogue, not the rows
// that happened to be loaded.
//
// 500 is the most the trade service returns per page. The catalogue is a
// little over 400 rows across both chains today, so this is all of it.
const CATALOG_LIMIT = 500;

// The whole catalogue as cards.
//
// A table gave seven columns equal weight, which is not how a coin is read: the
// symbol, the price and the risk decide whether it is worth a second look, and
// liquidity and volume are the supporting line. A card can say that in the
// order it is actually read, and the grid puts three of them where a table row
// put one.
export function MemeGrid({ onOpen }: { onOpen: (token: MemeToken) => void }) {
  const t = useTranslations("meme");
  const { tokens, isLoading, error, refetch } = useMemeCatalog(1, CATALOG_LIMIT);
  const [query, setQuery] = useState("");
  const search = useMemeSearch(query);
  const [bands, setBands] = useState<Set<TokenRiskLevel>>(new Set());

  const source = search.active ? search.results : tokens;
  const rows = useMemo(() => filterByRisk(source, bands), [source, bands]);
  const paged = usePaged(rows, PER_PAGE);

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
  // A failed request is shown in place of the rows. Search failure is its own
  // case: the catalog may be fine, so the retry there is clearing the search.
  const failed = search.active ? !!search.error : !!error && tokens.length === 0;

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="ws-display text-[18px]">{t("allTitle")}</div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <MemeSearchInput value={query} onChange={setQuery} label={t("searchAllLabel")} />
          <MemeFilterButton
            active={bands}
            onToggle={toggle}
            onClear={() => setBands(new Set())}
            counts={counts}
          />
        </div>
      </div>

      {failed ? (
        <MemeUnavailable onRetry={search.active ? () => setQuery("") : () => void refetch()} />
      ) : null}

      <div className="mt-4 grid grid-cols-1 gap-3 min-[700px]:grid-cols-2 min-[1200px]:grid-cols-3">
        {failed
          ? null
          : busy
            ? Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="h-[120px] animate-pulse rounded-[16px] bg-white/6" />
              ))
            : paged.pageItems.map((token) => (
                <button
                  key={`${token.chainId}:${token.address}`}
                  onClick={() => onOpen(token)}
                  className="ws-card hover:border-accent/50 flex cursor-pointer items-center gap-3.5 rounded-[16px] p-4 text-left transition-[transform,border-color] duration-150 hover:-translate-y-0.5"
                >
                  {/* Large on purpose: the artwork is most of what a memecoin
                    is, and at avatar size it reads as a bullet point rather
                    than the thing being chosen. */}
                  <div className="shrink-0 overflow-hidden rounded-[14px]">
                    <MemeCoin token={token} size={64} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-sans text-[15px] font-semibold">
                        {token.symbol ?? "?"}
                      </span>
                      <RiskBadge level={token.riskLevel} />
                    </div>
                    <div className="truncate text-[11.5px] font-normal text-white/45">
                      {token.name ?? "—"}
                    </div>
                    {/* The supporting line: what a coin is worth a second look
                      for, once the symbol and the price have been read. */}
                    <div className="tnum mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] font-normal text-white/40">
                      <span>
                        {t("colLiquidity")} {compactUsd(token.liquidityUsd)}
                      </span>
                      <span>
                        {t("colVolume")} {compactUsd(token.volume24hUsd)}
                      </span>
                      <span>
                        {t("colMcap")} {compactUsd(token.marketCapUsd)}
                      </span>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="tnum text-[14px] font-medium">{priceLabel(token.priceUsd)}</div>
                    <div className="text-[11.5px]">
                      <PctChange value={token.priceChange24hPercent} />
                    </div>
                  </div>
                </button>
              ))}
      </div>

      {!busy && !failed && rows.length === 0 ? (
        <div className="ws-card mt-4 grid place-items-center px-4 py-12 text-center text-[13px] font-normal text-white/45">
          {search.active ? t("noResults") : bands.size > 0 ? t("noneInBands") : t("empty")}
        </div>
      ) : null}

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
