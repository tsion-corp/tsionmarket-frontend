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
import { BalanceCard } from "@/components/dashboard/balance-card";
import { Switch } from "@/components/ui/switch";
import { AssetIcon } from "@/components/ui/asset-icon";
import { NetworkIcon } from "@/components/ui/network-icon";
import { useMoney } from "@/components/ui/currency-select";
import { Eyebrow } from "@/components/ui/eyebrow";
import { SearchIcon, WalletIcon } from "@/components/ui/icons";
import { ProgressBar } from "@/components/ui/progress-bar";
import { usePortfolio, type TokenBalance } from "@/hooks/use-portfolio";
import { coingeckoId } from "@/lib/coingecko";
import { formatQty } from "@/lib/format";
import type { ConfirmPayload, DetailPayload } from "@/components/dashboard/modal-types";

interface PortfolioViewProps {
  onOpenFunds: () => void;
  onOpenWithdraw: () => void;
  onOpenDetail: (detail: DetailPayload) => void;
  onOpenConfirm: (confirm: ConfirmPayload) => void;
}

const NETWORK_LABELS: Record<string, string> = {
  "eth-mainnet": "Ethereum",
  "base-mainnet": "Base",
  "arb-mainnet": "Arbitrum",
  "opt-mainnet": "Optimism",
  "polygon-mainnet": "Polygon",
  "solana-mainnet": "Solana",
};

function networkLabel(network: string): string {
  return NETWORK_LABELS[network] ?? network;
}

// Stable gradient per symbol so tokens without a built-in icon stay visually
// distinct across the app.
function tokenBg(symbol: string): string {
  let hue = 0;
  for (let i = 0; i < symbol.length; i++) {
    hue = (hue * 31 + symbol.charCodeAt(i)) % 360;
  }
  return `linear-gradient(135deg, hsl(${hue} 62% 46%), hsl(${(hue + 42) % 360} 55% 32%))`;
}

const ALLOCATION_COLORS = [
  "#A78BFA",
  "#7C9CE7",
  "#7CE7B0",
  "#E7C97C",
  "#E79CC9",
  "rgba(255,255,255,0.4)",
];

interface AllocationSlice {
  name: string;
  pct: number;
  color: string;
}

function buildAllocation(tokens: TokenBalance[], totalUsd: number): AllocationSlice[] {
  if (totalUsd <= 0) return [];
  const top = tokens.slice(0, 5);
  const slices: AllocationSlice[] = top.map((t, i) => ({
    name: t.symbol,
    pct: (t.valueUsd / totalUsd) * 100,
    color: ALLOCATION_COLORS[i],
  }));
  const restValue = tokens.slice(5).reduce((sum, t) => sum + t.valueUsd, 0);
  if (restValue > 0) {
    slices.push({ name: "Other", pct: (restValue / totalUsd) * 100, color: ALLOCATION_COLORS[5] });
  }
  return slices;
}

const holdingsColumn = createColumnHelper<TokenBalance>();
const HOLDINGS_COLUMNS = [
  holdingsColumn.accessor((t) => `${t.symbol} ${t.name}`, { id: "search", enableSorting: false }),
  holdingsColumn.accessor((t) => t.priceUsd, { id: "price" }),
  holdingsColumn.accessor((t) => t.valueUsd, { id: "value" }),
];

export function PortfolioView({
  onOpenFunds,
  onOpenWithdraw,
  onOpenDetail,
  onOpenConfirm,
}: PortfolioViewProps) {
  const { totalUsd, tokens, loading, error, refetch } = usePortfolio();
  const money = useMoney();
  const allocation = buildAllocation(tokens, totalUsd);
  // Distinguish "we couldn't load it" from "you have nothing". A failed request
  // with no cached tokens is an error, not an empty wallet; if a cached balance
  // survives (persisted), keep showing it rather than an error.
  const errored = !loading && error && tokens.length === 0;
  const isEmpty = !loading && !error && tokens.length === 0;

  const [search, setSearch] = useState("");
  const [hideZero, setHideZero] = useState(true);
  const [sorting, setSorting] = useState<SortingState>([{ id: "value", desc: true }]);

  // When on, drop rows with no real value — the always-present USDC/USDT/native
  // baseline (shown at $0) plus dust that rounds to $0.00. The 0.005 floor is one
  // rounded cent, so anything the table would render as "$0.00" is hidden.
  const visibleTokens = useMemo(
    () => (hideZero ? tokens.filter((t) => t.valueUsd >= 0.005) : tokens),
    [tokens, hideZero]
  );

  const table = useReactTable({
    data: visibleTokens,
    columns: HOLDINGS_COLUMNS,
    state: { globalFilter: search, sorting },
    onGlobalFilterChange: setSearch,
    onSortingChange: setSorting,
    globalFilterFn: (row, _id, value) =>
      String(row.getValue("search")).toLowerCase().includes(String(value).toLowerCase()),
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 10 } },
  });
  const holdingRows = table.getRowModel().rows;
  const holdingsPage = table.getState().pagination.pageIndex + 1;
  const holdingsPages = table.getPageCount();

  const sortBtn = (id: string, label: string, extra: string) => {
    const col = table.getColumn(id);
    const s = col?.getIsSorted();
    return (
      <button
        onClick={() => col?.toggleSorting()}
        className={`flex cursor-pointer items-center gap-1 hover:text-white/70 ${extra}`}
      >
        {label}
        <span className="text-white/30">{s === "asc" ? "↑" : s === "desc" ? "↓" : ""}</span>
      </button>
    );
  };

  const reviewConfirm = (t: TokenBalance): ConfirmPayload => ({
    eyebrow: "Portfolio",
    badgeSym: t.symbol,
    badgeBg: tokenBg(t.symbol),
    badgeLogo: t.logo,
    title: t.name,
    sub: `${formatQty(t.balance)} ${t.symbol} · ${networkLabel(t.network)}`,
    lines: [
      { k: "Holdings", v: `${formatQty(t.balance)} ${t.symbol}` },
      { k: "Market price", v: money.format(t.priceUsd) },
      { k: "Network", v: networkLabel(t.network) },
      { k: "Position value", v: money.format(t.valueUsd), c: "#7CE7B0" },
    ],
    cta: "Done",
    successTitle: "All set",
    successMsg: `${t.name} is up to date in your portfolio.`,
  });

  const openToken = (t: TokenBalance) =>
    onOpenDetail({
      sym: t.symbol,
      name: t.name,
      sub: `${formatQty(t.balance)} ${t.symbol}`,
      price: money.format(t.priceUsd),
      chg: "",
      bg: tokenBg(t.symbol),
      stats: [
        { k: "Holdings", v: `${formatQty(t.balance)} ${t.symbol}` },
        { k: "Market price", v: money.format(t.priceUsd) },
        { k: "Network", v: networkLabel(t.network) },
        { k: "Position value", v: money.format(t.valueUsd) },
      ],
      cta: `Trade ${t.name}`,
      onCta: () => onOpenConfirm(reviewConfirm(t)),
      coingeckoId: coingeckoId(t.symbol) ?? undefined,
      up: true,
      logo: t.logo,
    });

  return (
    <div className="mx-auto w-full max-w-[1520px] p-4 sm:p-6 lg:p-8">
      <Eyebrow>Portfolio</Eyebrow>

      <div className="mt-3.5 grid grid-cols-1 gap-4 min-[720px]:grid-cols-[1.4fr_1fr]">
        <BalanceCard onOpenFunds={onOpenFunds} onOpenWithdraw={onOpenWithdraw} />

        <div className="ws-card flex flex-col p-5 sm:p-[26px]">
          <div className="text-[13px] font-normal text-white/60">Allocation</div>
          {loading ? (
            <div className="mt-4 flex flex-col gap-3.5">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-[7px] animate-pulse rounded-full bg-white/8" />
              ))}
            </div>
          ) : allocation.length === 0 ? (
            <div className="grid flex-1 place-items-center py-8 text-center text-[13px] font-normal text-white/40">
              No assets to allocate yet
            </div>
          ) : (
            <div className="mt-4 flex flex-col gap-3.5">
              {allocation.map((a) => (
                <div key={a.name}>
                  <div className="mb-1.5 flex justify-between text-[13.5px] font-normal">
                    <span className="truncate text-white/85">{a.name}</span>
                    <span className="tnum text-white/55">{a.pct.toFixed(1)}%</span>
                  </div>
                  <ProgressBar pct={a.pct} color={a.color} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {errored ? (
        <div className="ws-card mt-[18px] flex flex-col items-center gap-3 px-6 py-12 text-center">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-white/6">
            <WalletIcon size={22} />
          </div>
          <div className="ws-serif text-[22px]">Couldn&apos;t load your portfolio</div>
          <p className="max-w-[320px] text-[13.5px] font-normal text-white/55">
            We couldn&apos;t reach your balances just now. Your funds are safe. Please try again.
          </p>
          <button
            onClick={() => refetch()}
            className="text-ink mt-1 cursor-pointer rounded-xl bg-white px-5 py-2.5 font-sans text-[13px] font-semibold hover:opacity-90"
          >
            Try again
          </button>
        </div>
      ) : isEmpty ? (
        <div className="ws-card mt-[18px] flex flex-col items-center gap-3 px-6 py-12 text-center">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-white/6">
            <WalletIcon size={22} />
          </div>
          <div className="ws-serif text-[22px]">Your portfolio is empty</div>
          <p className="max-w-[320px] text-[13.5px] font-normal text-white/55">
            Add funds to get started. Tokens across your wallets show up here automatically.
          </p>
          <button
            onClick={onOpenFunds}
            className="text-ink mt-1 cursor-pointer rounded-xl bg-white px-5 py-2.5 font-sans text-[13px] font-semibold hover:opacity-90"
          >
            Add funds
          </button>
        </div>
      ) : (
        <div className="ws-card mt-[18px] overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-5 pb-3.5 sm:px-6">
            <span className="ws-serif text-[22px]">Your holdings</span>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 text-[12.5px] font-normal whitespace-nowrap text-white/60">
                <span>Hide zero value</span>
                <Switch
                  size="sm"
                  checked={hideZero}
                  onCheckedChange={(checked) => setHideZero(checked)}
                />
              </div>
              <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                <SearchIcon />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search"
                  className="w-[130px] min-w-0 border-none bg-transparent text-[13px] font-normal text-white outline-none"
                />
              </div>
            </div>
          </div>
          <div className="grid grid-cols-[1.7fr_auto] gap-3.5 px-4 pb-2.5 text-[11.5px] tracking-[0.04em] text-white/40 uppercase min-[560px]:grid-cols-[2fr_1fr_1fr_1fr] sm:px-6">
            <span>Asset</span>
            {sortBtn("price", "Price", "hidden justify-end text-right min-[560px]:flex")}
            <span className="hidden text-right min-[560px]:block">Network</span>
            {sortBtn("value", "Value", "justify-end text-right")}
          </div>

          {loading ? (
            [0, 1, 2].map((i) => (
              <div
                key={i}
                className="flex items-center gap-3 border-t border-white/6 px-4 py-3.5 sm:px-6"
              >
                <span className="h-9 w-9 shrink-0 animate-pulse rounded-[11px] bg-white/8" />
                <span className="h-4 w-32 animate-pulse rounded bg-white/8" />
                <span className="ml-auto h-4 w-16 animate-pulse rounded bg-white/8" />
              </div>
            ))
          ) : holdingRows.length === 0 ? (
            <div className="border-t border-white/6 px-6 py-8 text-center text-[13px] font-normal text-white/45">
              {search
                ? "No holdings match your search."
                : hideZero
                  ? "No assets with a balance yet. Turn off “Hide zero value” to see every supported asset."
                  : "No holdings yet."}
            </div>
          ) : (
            <>
              {holdingRows.map((row) => {
                const t = row.original;
                return (
                  <button
                    key={t.symbol + t.network}
                    onClick={() => openToken(t)}
                    className="grid w-full cursor-pointer grid-cols-[1.7fr_auto] items-center gap-3.5 border-t border-white/6 px-4 py-3.5 text-left transition-colors hover:bg-white/4 min-[560px]:grid-cols-[2fr_1fr_1fr_1fr] sm:px-6"
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <span className="relative shrink-0">
                        <AssetIcon sym={t.symbol} bg={tokenBg(t.symbol)} logo={t.logo} />
                        <span className="absolute -right-1 -bottom-1 grid place-items-center rounded-full bg-[#0d0d0f] p-[1.5px]">
                          <NetworkIcon network={t.network} size={14} />
                        </span>
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-sans text-[14.5px] font-medium">
                          {t.symbol}
                        </span>
                        <span className="block truncate text-xs font-normal text-white/50">
                          {formatQty(t.balance)} · {networkLabel(t.network)}
                        </span>
                      </span>
                    </span>
                    <span className="tnum hidden text-right text-sm font-normal min-[560px]:block">
                      {money.format(t.priceUsd)}
                    </span>
                    <span className="hidden items-center justify-end gap-1.5 text-[13px] font-normal text-white/60 min-[560px]:flex">
                      <NetworkIcon network={t.network} size={16} />
                      {networkLabel(t.network)}
                    </span>
                    <span className="tnum text-right font-sans text-sm font-medium">
                      {money.format(t.valueUsd)}
                    </span>
                  </button>
                );
              })}
              {holdingsPages > 1 ? (
                <div className="flex items-center justify-between border-t border-white/6 px-4 py-3.5 sm:px-6">
                  <span className="text-[12.5px] font-normal text-white/45">
                    Page {holdingsPage} of {holdingsPages}
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
            </>
          )}
        </div>
      )}
    </div>
  );
}
