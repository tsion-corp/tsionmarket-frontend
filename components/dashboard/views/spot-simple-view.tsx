"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  createColumnHelper,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from "@tanstack/react-table";
import { AssetIcon } from "@/components/ui/asset-icon";
import { SearchIcon } from "@/components/ui/icons";
import { useSpotMarkets, type SpotMarket } from "@/hooks/use-spot-markets";
import { tokenBg } from "@/lib/trade/assets";
import { formatUsd } from "@/lib/trade/math";
import type { BuyPayload, DetailPayload } from "@/components/dashboard/modal-types";

interface SpotSimpleViewProps {
  onOpenDetail: (detail: DetailPayload) => void;
  onOpenBuy: (buy: BuyPayload) => void;
}

// How many rows the collapsed list shows. Six keeps the majors above the fold
// on a phone; the rest sit behind one tap on "Show all".
const PREVIEW_ROWS = 6;

function changeLabel(chg: number): string {
  const v = Number.isFinite(chg) ? chg : 0;
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}

function compactUsd(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "—";
  return `$${Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(n)}`;
}

const columnHelper = createColumnHelper<SpotMarket>();
const columns = [
  columnHelper.accessor((r) => `${r.symbol} ${r.name}`, { id: "asset", enableSorting: false }),
  columnHelper.accessor("priceUsd", { id: "price" }),
  columnHelper.accessor("change24h", { id: "change" }),
  columnHelper.accessor("marketCap", { id: "mcap" }),
];

// The simple spot interface: the tradable market list as a searchable, sortable
// table. Same universe as the pro terminal (every Dextopus-buyable token, minus
// stables), so anything bought here can be traded there. Tapping a row opens
// the asset detail sheet with a Buy call-to-action — the guided flow — so
// someone new to trading never sees an order ticket.
export function SpotSimpleView({ onOpenDetail, onOpenBuy }: SpotSimpleViewProps) {
  const t = useTranslations("markets");
  const [search, setSearch] = useState("");
  const [sorting, setSorting] = useState<SortingState>([{ id: "mcap", desc: true }]);
  // Collapsed by default so the list doesn't dominate the page; searching
  // always shows every match, since a query is an explicit ask for the rest.
  const [expanded, setExpanded] = useState(false);
  const { markets, loading, error } = useSpotMarkets();

  const table = useReactTable({
    data: markets,
    columns,
    state: { globalFilter: search, sorting },
    onGlobalFilterChange: setSearch,
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 12 } },
  });

  const showAll = expanded || search.trim().length > 0;
  const pageRows = table.getRowModel().rows;
  const rows = showAll ? pageRows : pageRows.slice(0, PREVIEW_ROWS);
  const totalCount = table.getFilteredRowModel().rows.length;
  const { pageIndex } = table.getState().pagination;
  const pageCount = table.getPageCount();

  const openToken = (token: SpotMarket) =>
    onOpenDetail({
      sym: token.symbol,
      name: token.name,
      sub: token.symbol,
      price: token.priceUsd > 0 ? formatUsd(token.priceUsd) : "—",
      chg: changeLabel(token.change24h),
      bg: tokenBg(token.symbol),
      coingeckoId: token.coingeckoId ?? undefined,
      up: token.change24h >= 0,
      logo: token.logo,
      // Simple spot trading shows candles only, no area chart.
      candlesOnly: true,
      stats: [
        { k: t("price"), v: token.priceUsd > 0 ? formatUsd(token.priceUsd) : "—" },
        { k: t("change24hFull"), v: changeLabel(token.change24h) },
        { k: t("marketCap"), v: compactUsd(token.marketCap) },
      ],
      cta: t("buyToken", { name: token.name }),
      onCta: () =>
        onOpenBuy({
          symbol: token.symbol,
          name: token.name,
          priceUsd: token.priceUsd,
          logo: token.logo,
        }),
    });

  const sortHeader = (id: string, label: string, className: string) => {
    const col = table.getColumn(id);
    const sorted = col?.getIsSorted();
    return (
      <button
        onClick={() => col?.toggleSorting()}
        className={`flex cursor-pointer items-center gap-1 hover:text-white/70 ${className}`}
      >
        {label}
        <span className="text-white/30">
          {sorted === "asc" ? "↑" : sorted === "desc" ? "↓" : ""}
        </span>
      </button>
    );
  };

  return (
    <div>
      <div className="flex justify-start">
        <div className="flex w-full max-w-[340px] items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5">
          <SearchIcon />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("searchPlaceholder")}
            className="min-w-0 flex-1 border-none bg-transparent text-[13.5px] font-normal text-white outline-none"
          />
        </div>
      </div>

      <div className="ws-card mt-4 overflow-hidden">
        <div className="grid grid-cols-[1.6fr_1fr] gap-3.5 px-4 py-4 text-[11.5px] tracking-[0.04em] text-white/40 uppercase min-[560px]:grid-cols-[2fr_1fr_1fr_1.2fr] sm:px-6">
          <span>{t("asset")}</span>
          {sortHeader("price", t("price"), "justify-end")}
          {sortHeader("change", t("change24h"), "hidden justify-end min-[560px]:flex")}
          {sortHeader("mcap", t("marketCap"), "hidden justify-end min-[560px]:flex")}
        </div>

        {loading ? (
          <div className="border-t border-white/6 px-6 py-10 text-center text-[13.5px] font-normal text-white/45">
            {t("loadingMarkets")}
          </div>
        ) : error ? (
          <div className="border-t border-white/6 px-6 py-10 text-center text-[13.5px] font-normal text-white/45">
            {t("marketsUnavailable")}
          </div>
        ) : rows.length === 0 ? (
          <div className="border-t border-white/6 px-6 py-10 text-center text-[13.5px] font-normal text-white/45">
            {t("noResults")}
          </div>
        ) : (
          rows.map((row) => {
            const token = row.original;
            return (
              <div
                key={token.symbol}
                onClick={() => openToken(token)}
                className="grid cursor-pointer grid-cols-[1.6fr_1fr] items-center gap-3.5 border-t border-white/6 px-4 py-3.5 transition-colors hover:bg-white/4 min-[560px]:grid-cols-[2fr_1fr_1fr_1.2fr] sm:px-6"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <AssetIcon
                    sym={token.symbol}
                    bg={tokenBg(token.symbol)}
                    logo={token.logo}
                    fallback="gradient"
                  />
                  <div className="min-w-0">
                    <div className="truncate font-sans text-[14.5px] font-medium">
                      {token.symbol}
                    </div>
                    {/* A name that just repeats the ticker adds nothing. */}
                    {token.name.toLowerCase() !== token.symbol.toLowerCase() ? (
                      <div className="truncate text-xs font-normal text-white/50">{token.name}</div>
                    ) : null}
                  </div>
                </div>
                <span className="text-right">
                  <span className="tnum block text-sm font-normal">
                    {token.priceUsd > 0 ? formatUsd(token.priceUsd) : "—"}
                  </span>
                  {/* Below 560px the change column is gone, so the movement
                      number stacks under the price instead of disappearing. */}
                  <span
                    className={`tnum block text-[12px] font-normal min-[560px]:hidden ${
                      token.change24h >= 0 ? "text-up" : "text-down"
                    }`}
                  >
                    {changeLabel(token.change24h)}
                  </span>
                </span>
                <span
                  className={`tnum hidden text-right text-[13.5px] font-normal min-[560px]:block ${
                    token.change24h >= 0 ? "text-up" : "text-down"
                  }`}
                >
                  {changeLabel(token.change24h)}
                </span>
                <span className="tnum hidden text-right text-[13px] font-normal text-white/60 min-[560px]:block">
                  {compactUsd(token.marketCap)}
                </span>
              </div>
            );
          })
        )}

        {!loading && !error && !showAll && totalCount > PREVIEW_ROWS ? (
          <div className="border-t border-white/6 p-2">
            <button
              onClick={() => setExpanded(true)}
              className="w-full cursor-pointer rounded-lg py-2.5 text-center text-[13px] font-medium text-white/70 transition-colors hover:bg-white/4 hover:text-white"
            >
              {t("showAllTokens", { count: totalCount })}
            </button>
          </div>
        ) : null}

        {!loading && !error && showAll && rows.length > 0 ? (
          <div className="flex items-center justify-between border-t border-white/6 px-4 py-3.5 sm:px-6">
            <span className="text-[12.5px] font-normal text-white/45">
              {t("pageOf", { page: pageIndex + 1, pages: pageCount })}
            </span>
            <div className="flex gap-2">
              {search.trim().length === 0 ? (
                <button
                  onClick={() => {
                    setExpanded(false);
                    table.setPageIndex(0);
                  }}
                  className="cursor-pointer rounded-lg px-3 py-1.5 text-[12.5px] font-medium text-white/55 hover:text-white"
                >
                  {t("showLess")}
                </button>
              ) : null}
              <button
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
                className="cursor-pointer rounded-lg border border-white/12 bg-white/5 px-3 py-1.5 text-[12.5px] font-medium text-white/75 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                {t("prev")}
              </button>
              <button
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
                className="cursor-pointer rounded-lg border border-white/12 bg-white/5 px-3 py-1.5 text-[12.5px] font-medium text-white/75 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                {t("next")}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
