"use client";

import { useFormatter, useTranslations } from "next-intl";
import { DISCOVERY_VIEWS, type DiscoveryView } from "@/lib/meme/catalog";

// The two controls every catalogue list shares: the desk, the grid and the
// phone's Memecoins tab (ADR-2026-09-14-memecoins-trade-contract, slice 4).

// Curated / All over DISCOVERY_POLICY. Curated is the maintainers' filters and
// the default; All is the trade contract's view, where a thin coin is listed
// with its badge and asks for consent before a quote.
export function MemeViewSwitch({
  value,
  onChange,
  className = "",
}: {
  value: DiscoveryView;
  onChange: (view: DiscoveryView) => void;
  className?: string;
}) {
  const t = useTranslations("meme");
  return (
    <div
      role="group"
      aria-label={t("viewLabel")}
      className={`border-hairline bg-surface inline-flex h-[36px] shrink-0 items-center gap-1 rounded-full border p-[3px] ${className}`}
    >
      {DISCOVERY_VIEWS.map((view) => {
        const on = view === value;
        return (
          <button
            key={view}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(view)}
            className={`h-full cursor-pointer rounded-full px-3 font-sans text-[12px] font-semibold transition-colors ${
              on ? "bg-white text-black" : "text-white/60 hover:text-white"
            }`}
          >
            {view === "curated" ? t("viewCurated") : t("viewAll")}
          </button>
        );
      })}
    </div>
  );
}

// "500 of 11,502": the rows loaded against the server's total, which is what
// the catalogue's size actually is, and beside it how many the view shows.
// "Load more" asks for the next page of 500 until the pages cover the total.
// A list that loads its pages ahead on its own (the desk, with its numbered
// pager) passes `autoLoads`: the button goes, the strip says when a page is
// loading, and a failed page gets a retry instead.
// Nothing is drawn before the first page has said what the total is.
export function MemeCatalogMore({
  loaded,
  total,
  shownCount,
  hasMore,
  loadingMore,
  failed,
  onLoadMore,
  autoLoads = false,
  className = "",
}: {
  loaded: number;
  total: number | null;
  shownCount: number;
  hasMore: boolean;
  loadingMore: boolean;
  /** The last "Load more" failed; the pages already held stay on screen. */
  failed: boolean;
  onLoadMore: () => void;
  /** Pages load as the reader reaches them; there is no Load more to press. */
  autoLoads?: boolean;
  className?: string;
}) {
  const t = useTranslations("meme");
  const format = useFormatter();
  if (total === null) return null;
  return (
    <div
      data-region="catalog-status"
      className={`flex flex-wrap items-center justify-between gap-x-3 gap-y-2 font-sans text-[11.5px] font-normal text-white/45 ${className}`}
    >
      <span className="tnum flex flex-wrap items-center gap-x-2">
        <span>
          {t("catalogCount", { loaded: format.number(loaded), total: format.number(total) })}
        </span>
        <span aria-hidden>·</span>
        <span>{t("catalogShown", { shown: format.number(shownCount) })}</span>
      </span>
      {failed ? <span role="status">{t("catalogMoreFailed")}</span> : null}
      {autoLoads ? (
        failed && hasMore ? (
          <button
            type="button"
            onClick={onLoadMore}
            disabled={loadingMore}
            className="cursor-pointer rounded-full border border-white/15 px-3 py-1 text-[11.5px] font-medium text-white/80 transition-colors hover:border-white/30 hover:text-white disabled:cursor-default disabled:opacity-60"
          >
            {t("retry")}
          </button>
        ) : loadingMore ? (
          <span role="status">{t("catalogLoadingMore")}</span>
        ) : null
      ) : hasMore ? (
        <button
          type="button"
          onClick={onLoadMore}
          disabled={loadingMore}
          className="cursor-pointer rounded-full border border-white/15 px-3 py-1 text-[11.5px] font-medium text-white/80 transition-colors hover:border-white/30 hover:text-white disabled:cursor-default disabled:opacity-60"
        >
          {loadingMore ? t("catalogLoadingMore") : t("catalogMore")}
        </button>
      ) : null}
    </div>
  );
}
