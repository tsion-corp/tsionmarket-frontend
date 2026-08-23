"use client";

import { useMemo, useState } from "react";
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
import { RwaAssetRow } from "@/features/rwa/components/rwa-asset-row";
import { RwaCategoryTabs } from "@/features/rwa/components/rwa-category-tabs";
import { ListPagination } from "@/components/ui/list-pagination";
import { SearchIcon } from "@/components/ui/icons";
import { tokenLogoKey, useTokenLogos } from "@/hooks/use-token-logos";
import { assetPriceUsd, type RwaApiAsset } from "@/features/rwa/lib/api";
import { assetLiquidityUsd, type RwaAssetView } from "@/features/rwa/lib/presenter";

interface RwaAssetListProps {
  assets: RwaAssetView[];
  selectedId: string;
  loading: boolean;
  error: boolean;
  onOpen: (asset: RwaApiAsset) => void;
  onTrade: (asset: RwaApiAsset) => void;
}

const PER_PAGE = 6;

const columnHelper = createColumnHelper<RwaAssetView>();
const columns = [
  columnHelper.accessor((a) => `${a.symbol} ${a.name} ${a.issuer} ${a.chain}`, {
    id: "search",
    enableSorting: false,
  }),
  columnHelper.accessor((a) => assetPriceUsd(a) ?? 0, { id: "price" }),
  columnHelper.accessor((a) => a.market?.change24h ?? 0, { id: "change" }),
  columnHelper.accessor((a) => assetLiquidityUsd(a) ?? 0, { id: "liquidity" }),
];

export function RwaAssetList({
  assets,
  selectedId,
  loading,
  error,
  onOpen,
  onTrade,
}: RwaAssetListProps) {
  const t = useTranslations("rwa");
  const [tab, setTab] = useState("All");
  const [search, setSearch] = useState("");
  const [sorting, setSorting] = useState<SortingState>([]);

  // "All" is a stable filter value; only its label is translated. Category
  // names come from the backend and display as-is.
  const tabs = useMemo(
    () => [
      { value: "All", label: t("allCategories") },
      ...[...new Set(assets.map((a) => a.category))].sort().map((c) => ({ value: c, label: c })),
    ],
    [assets, t]
  );
  // Base first, then everything else in the order the registry returned. Base
  // is the chain the app settles on, so those are the assets a deposit here can
  // buy without bridging; burying them on page two hides the ones that work
  // best. A column sort still overrides this, since the table only falls back
  // to source order while nothing is sorted.
  const data = useMemo(() => {
    const inTab = tab === "All" ? assets : assets.filter((a) => a.category === tab);
    return [...inTab].sort((a, b) => Number(b.chain === "base") - Number(a.chain === "base"));
  }, [assets, tab]);

  const table = useReactTable({
    data,
    columns,
    state: { globalFilter: search, sorting },
    onGlobalFilterChange: setSearch,
    onSortingChange: setSorting,
    globalFilterFn: (row, _id, value) =>
      String(row.getValue("search")).toLowerCase().includes(String(value).toLowerCase()),
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: PER_PAGE } },
  });

  const rows = table.getRowModel().rows;
  const visible = rows.map((r) => r.original);
  const logos = useTokenLogos(visible.map((a) => ({ chain: a.chain, address: a.address })));
  const page = table.getState().pagination.pageIndex + 1;
  const pages = table.getPageCount();

  const sortHeader = (id: string, label: string, extra = "") => {
    const col = table.getColumn(id);
    const sorted = col?.getIsSorted();
    return (
      <button
        onClick={() => col?.toggleSorting()}
        className={`flex w-full cursor-pointer items-center justify-end gap-1 hover:text-white/70 ${extra}`}
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
      <div className="flex flex-col gap-3 min-[720px]:flex-row min-[720px]:items-center min-[720px]:justify-between">
        <RwaCategoryTabs tabs={tabs} active={tab} onChange={setTab} />
        <div className="flex max-w-[260px] items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5">
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
        <div className="grid grid-cols-[1.6fr_1fr_auto] gap-3 px-4 py-4 text-[11.5px] tracking-[0.04em] text-white/40 uppercase min-[560px]:grid-cols-[1.7fr_0.8fr_1fr_auto] min-[820px]:grid-cols-[1.9fr_0.8fr_1fr_0.7fr_1fr_0.8fr] sm:px-6">
          <span>{t("asset")}</span>
          <span className="hidden min-[560px]:block">{t("network")}</span>
          {sortHeader("price", t("price"))}
          {sortHeader("change", t("change24h"), "hidden min-[820px]:flex")}
          {sortHeader("liquidity", t("liquidity"), "hidden min-[820px]:flex")}
          <span />
        </div>

        {error ? (
          <div className="border-t border-white/6 px-6 py-10 text-center text-[13.5px] font-normal text-white/45">
            {t("registryUnavailable")}
          </div>
        ) : loading ? (
          <div className="border-t border-white/6 px-6 py-10 text-center text-[13.5px] font-normal text-white/45">
            {t("loadingAssets")}
          </div>
        ) : visible.length === 0 ? (
          <div className="border-t border-white/6 px-6 py-10 text-center text-[13.5px] font-normal text-white/45">
            {search.trim() ? t("noSearchMatches") : t("noCategoryAssets")}
          </div>
        ) : (
          <>
            {visible.map((asset) => (
              <RwaAssetRow
                key={asset.id}
                asset={asset}
                selected={asset.id === selectedId}
                logo={logos[tokenLogoKey(asset.chain, asset.address)]}
                onOpen={() => onOpen(asset)}
                onTrade={() => onTrade(asset)}
              />
            ))}
            {pages > 1 ? (
              <ListPagination page={page} pages={pages} onPage={(p) => table.setPageIndex(p - 1)} />
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
