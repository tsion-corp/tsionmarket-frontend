"use client";

import { useMemo, useState } from "react";
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
import { Eyebrow } from "@/components/ui/eyebrow";
import { SearchIcon } from "@/components/ui/icons";
import { useMarketTokens } from "@/hooks/use-market-tokens";
import { useBuyDestinations } from "@/hooks/use-buy-catalog";
import { buyableSymbols } from "@/lib/buy";
import type { MarketToken } from "@/lib/market-catalog";
import { formatUsd } from "@/lib/trade/math";
import type { BuyPayload, DetailPayload } from "@/components/dashboard/modal-types";

interface MarketsViewProps {
  onOpenDetail: (detail: DetailPayload) => void;
  onOpenBuy: (buy: BuyPayload) => void;
}

const ICON_BG = "linear-gradient(135deg,#d4d4d8,#a2a2a8)";

function changeLabel(chg: number): string {
  const v = Number.isFinite(chg) ? chg : 0;
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}

function compactUsd(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "—";
  return `$${Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(n)}`;
}

const columnHelper = createColumnHelper<MarketToken>();
const columns = [
  columnHelper.accessor((r) => `${r.symbol} ${r.name}`, { id: "asset", enableSorting: false }),
  columnHelper.accessor("priceUsd", { id: "price" }),
  columnHelper.accessor("change24h", { id: "change" }),
  columnHelper.accessor("marketCap", { id: "mcap" }),
];

export function MarketsView({ onOpenDetail, onOpenBuy }: MarketsViewProps) {
  const [search, setSearch] = useState("");
  const [sorting, setSorting] = useState<SortingState>([{ id: "mcap", desc: true }]);
  const { data: tokens = [], isLoading, isError } = useMarketTokens("popular");
  const destinations = useBuyDestinations();

  // Show only assets a user can actually buy: intersect the market list with the
  // Dextopus buyable set, matched by symbol. While the catalog loads we hold the
  // table in its loading state rather than flash rows that then disappear. If the
  // catalog fails, fall back to the full list so price discovery still works.
  const buyable = useMemo(
    () => (destinations.data ? buyableSymbols(destinations.data) : null),
    [destinations.data]
  );
  const visibleTokens = useMemo(
    () => (buyable ? tokens.filter((t) => buyable.has(t.symbol.toUpperCase())) : tokens),
    [tokens, buyable]
  );
  const loading = isLoading || destinations.isLoading;

  const table = useReactTable({
    data: visibleTokens,
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

  const rows = table.getRowModel().rows;
  const { pageIndex } = table.getState().pagination;
  const pageCount = table.getPageCount();

  const openToken = (t: MarketToken) =>
    onOpenDetail({
      sym: t.symbol,
      name: t.name,
      sub: t.symbol,
      price: formatUsd(t.priceUsd),
      chg: changeLabel(t.change24h),
      bg: ICON_BG,
      coingeckoId: t.id,
      up: t.change24h >= 0,
      logo: t.logo,
      stats: [
        { k: "Price", v: formatUsd(t.priceUsd) },
        { k: "24h change", v: changeLabel(t.change24h) },
        { k: "Market cap", v: compactUsd(t.marketCap) },
      ],
      cta: `Buy ${t.name}`,
      onCta: () =>
        onOpenBuy({ symbol: t.symbol, name: t.name, priceUsd: t.priceUsd, logo: t.logo }),
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
    <div className="mx-auto w-full max-w-[1520px] p-4 sm:p-6 lg:p-8">
      <Eyebrow>Markets</Eyebrow>
      <div className="mt-3.5 flex justify-start">
        <div className="flex w-full max-w-[340px] items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5">
          <SearchIcon />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tokens"
            className="min-w-0 flex-1 border-none bg-transparent text-[13.5px] font-normal text-white outline-none"
          />
        </div>
      </div>

      <div className="ws-card mt-4 overflow-hidden">
        <div className="grid grid-cols-[1.6fr_1fr] gap-3.5 px-4 py-4 text-[11.5px] tracking-[0.04em] text-white/40 uppercase min-[560px]:grid-cols-[2fr_1fr_1fr_1.2fr] sm:px-6">
          <span>Asset</span>
          {sortHeader("price", "Price", "justify-end")}
          {sortHeader("change", "24h", "hidden justify-end min-[560px]:flex")}
          {sortHeader("mcap", "Market cap", "hidden justify-end min-[560px]:flex")}
        </div>

        {loading ? (
          <div className="border-t border-white/6 px-6 py-10 text-center text-[13.5px] font-normal text-white/45">
            Loading markets…
          </div>
        ) : isError ? (
          <div className="border-t border-white/6 px-6 py-10 text-center text-[13.5px] font-normal text-white/45">
            Live market prices are unavailable right now. Please try again shortly.
          </div>
        ) : rows.length === 0 ? (
          <div className="border-t border-white/6 px-6 py-10 text-center text-[13.5px] font-normal text-white/45">
            No tokens match your search.
          </div>
        ) : (
          rows.map((row) => {
            const t = row.original;
            return (
              <div
                key={t.id}
                onClick={() => openToken(t)}
                className="grid cursor-pointer grid-cols-[1.6fr_1fr] items-center gap-3.5 border-t border-white/6 px-4 py-3.5 transition-colors hover:bg-white/4 min-[560px]:grid-cols-[2fr_1fr_1fr_1.2fr] sm:px-6"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <AssetIcon sym={t.symbol} bg={ICON_BG} logo={t.logo} />
                  <div className="min-w-0">
                    <div className="truncate font-sans text-[14.5px] font-medium">{t.symbol}</div>
                    <div className="truncate text-xs font-normal text-white/50">{t.name}</div>
                  </div>
                </div>
                <span className="tnum text-right text-sm font-normal">{formatUsd(t.priceUsd)}</span>
                <span
                  className={`tnum hidden text-right text-[13.5px] font-normal min-[560px]:block ${
                    t.change24h >= 0 ? "text-up" : "text-down"
                  }`}
                >
                  {changeLabel(t.change24h)}
                </span>
                <span className="tnum hidden text-right text-[13px] font-normal text-white/60 min-[560px]:block">
                  {compactUsd(t.marketCap)}
                </span>
              </div>
            );
          })
        )}

        {!loading && !isError && rows.length > 0 ? (
          <div className="flex items-center justify-between border-t border-white/6 px-4 py-3.5 sm:px-6">
            <span className="text-[12.5px] font-normal text-white/45">
              Page {pageIndex + 1} of {pageCount}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
                className="cursor-pointer rounded-lg border border-white/12 bg-white/5 px-3 py-1.5 text-[12.5px] font-medium text-white/75 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                Prev
              </button>
              <button
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
                className="cursor-pointer rounded-lg border border-white/12 bg-white/5 px-3 py-1.5 text-[12.5px] font-medium text-white/75 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
