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
import { toast } from "@/lib/toast";
import { BalanceCard } from "@/components/dashboard/balance-card";
import { KashBanner } from "@/components/dashboard/kash/kash-banner";
import { KashCard } from "@/components/dashboard/kash/kash-card";
import { CrossBorderBanner } from "@/components/dashboard/remit/cross-border-banner";
import { Switch } from "@/components/ui/switch";
import { AssetIcon } from "@/components/ui/asset-icon";
import { tokenBg } from "@/lib/trade/assets";
import { NetworkIcon } from "@/components/ui/network-icon";
import { useMoney } from "@/components/ui/currency-select";
import { Eyebrow } from "@/components/ui/eyebrow";
import { SearchIcon, WalletIcon } from "@/components/ui/icons";
import { usePortfolio, type TokenBalance } from "@/hooks/use-portfolio";
import { MemeTradeSheet } from "@/components/dashboard/meme/meme-trade-sheet";
import { selectHoldings } from "@/lib/holdings";
import { canSellAsset } from "@/lib/sell";
import type { MemeToken } from "@/lib/meme/api";
import { coingeckoId } from "@/lib/coingecko";
import { formatQty } from "@/lib/format";
import type {
  BuyPayload,
  DetailPayload,
  RwaTradePayload,
  SellPayload,
} from "@/components/dashboard/modal-types";

interface PortfolioViewProps {
  onOpenFunds: () => void;
  onOpenWithdraw: () => void;
  onOpenCrossBorder: () => void;
  onOpenDetail: (detail: DetailPayload) => void;
  onOpenBuy: (buy: BuyPayload) => void;
  onOpenSell: (sell: SellPayload) => void;
  onOpenRwaTrade: (rwaTrade: RwaTradePayload) => void;
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

// A held meme balance as the trade sheet's listing shape; the sheet re-fetches
// the fresh catalog entry (risk, tradability) by address itself.
function toMemeToken(t: TokenBalance): MemeToken {
  return {
    chainId: 8453,
    address: t.address as string,
    name: t.name,
    symbol: t.symbol,
    decimals: t.decimals,
    logoUrl: t.logo,
    priceUsd: t.priceUsd > 0 ? String(t.priceUsd) : null,
    liquidityUsd: null,
    volume24hUsd: null,
    priceChange24hPercent: null,
    marketCapUsd: null,
    fdvUsd: null,
    pairAddress: null,
    dexName: null,
    riskLevel: "UNKNOWN",
    buyEnabled: true,
    sellEnabled: true,
    warnings: [],
  };
}

// Message keys in the portfolio catalog; the kind ids themselves never change.
const KIND_LABEL_KEY: Record<TokenBalance["kind"], string> = {
  coin: "kindCoin",
  stablecoin: "kindStablecoin",
  rwa: "kindRwa",
  token: "kindToken",
};

const KIND_STYLE: Record<TokenBalance["kind"], string> = {
  coin: "border-[#7C9CE7]/30 bg-[#7C9CE7]/12 text-[#9DB4F0]",
  stablecoin: "border-[#7CE7B0]/30 bg-[#7CE7B0]/12 text-[#7CE7B0]",
  rwa: "border-accent/35 bg-accent/12 text-accent",
  token: "border-white/12 bg-white/6 text-white/70",
};

// The asset-type pill shown in the holdings "Type" column.
function TypeChip({ kind }: { kind: TokenBalance["kind"] }) {
  const t = useTranslations("portfolio");
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${KIND_STYLE[kind]}`}
    >
      {t(KIND_LABEL_KEY[kind])}
    </span>
  );
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
  onOpenCrossBorder,
  onOpenDetail,
  onOpenBuy,
  onOpenSell,
  onOpenRwaTrade,
}: PortfolioViewProps) {
  const { tokens, loading, error, refetch } = usePortfolio();
  const money = useMoney();
  const t = useTranslations("portfolio");
  const tKash = useTranslations("kash");
  // Distinguish "we couldn't load it" from "you have nothing". A failed request
  // with no cached tokens is an error, not an empty wallet; if a cached balance
  // survives (persisted), keep showing it rather than an error.
  const errored = !loading && error && tokens.length === 0;
  const isEmpty = !loading && !error && tokens.length === 0;

  const [search, setSearch] = useState("");
  const [hideZero, setHideZero] = useState(true);
  // A meme holding being sold through the meme trade sheet.
  const [memeSell, setMemeSell] = useState<TokenBalance | null>(null);
  const [sorting, setSorting] = useState<SortingState>([{ id: "value", desc: true }]);

  // The table shows bought assets only, so drop the USDC-on-Base deposit float
  // first (see selectHoldings). Then, when hideZero is on, drop rows with no real
  // value — the always-present USDC/USDT/native baseline (shown at $0) plus dust
  // that rounds to $0.00. The 0.005 floor is one rounded cent, so anything the
  // table would render as "$0.00" is hidden.
  const visibleTokens = useMemo(() => {
    const holdings = selectHoldings(tokens);
    return hideZero ? holdings.filter((t) => t.valueUsd >= 0.005) : holdings;
  }, [tokens, hideZero]);

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

  const openToken = (token: TokenBalance) => {
    // RWA tokens trade through the RWA service (quote + build), never Dextopus,
    // which cannot source or deliver them. Route both buy and sell to the RWA
    // panel. `address` is always set for an RWA (it is never a native balance).
    const isRwa = token.kind === "rwa" && token.address !== null;
    // Trade-catalog memecoins sell through the meme trade service; Dextopus
    // cannot quote them, so its sell sheet always fails for these.
    const isMeme = token.meme === true && token.address !== null;
    // Otherwise offer "Sell" only for assets Dextopus can take as an origin;
    // native POL/SOL, for example, cannot be sold, so we don't dead-end the user.
    const sellable = canSellAsset(token.network, token.address);

    const buyAction = isRwa
      ? () =>
          onOpenRwaTrade({
            network: token.network,
            address: token.address as string,
            symbol: token.symbol,
            mode: "buy",
          })
      : () =>
          onOpenBuy({
            symbol: token.symbol,
            name: token.name,
            priceUsd: token.priceUsd,
            logo: token.logo,
          });

    const sellAction = isRwa
      ? {
          cta2: t("sell", { name: token.name }),
          onCta2: () =>
            onOpenRwaTrade({
              network: token.network,
              address: token.address as string,
              symbol: token.symbol,
              mode: "sell",
            }),
        }
      : isMeme
        ? {
            cta2: t("sell", { name: token.name }),
            onCta2: () => setMemeSell(token),
          }
        : sellable
          ? {
              cta2: t("sell", { name: token.name }),
              onCta2: () =>
                onOpenSell({
                  symbol: token.symbol,
                  name: token.name,
                  network: token.network,
                  address: token.address,
                  decimals: token.decimals,
                  balance: token.balance,
                  rawBalance: token.rawBalance,
                  priceUsd: token.priceUsd,
                  logo: token.logo,
                }),
            }
          : {};

    onOpenDetail({
      sym: token.symbol,
      name: token.name,
      sub: `${formatQty(token.balance)} ${token.symbol}`,
      price: money.format(token.priceUsd),
      chg: "",
      bg: tokenBg(token.symbol),
      stats: [
        { k: t("holdings"), v: `${formatQty(token.balance)} ${token.symbol}` },
        { k: t("marketPrice"), v: money.format(token.priceUsd) },
        { k: t("network"), v: networkLabel(token.network) },
        { k: t("positionValue"), v: money.format(token.valueUsd) },
      ],
      cta: t("buyMore", { name: token.name }),
      onCta: buyAction,
      ...sellAction,
      coingeckoId: coingeckoId(token.symbol) ?? undefined,
      up: true,
      logo: token.logo,
    });
  };

  const comingSoon = () => toast.info(tKash("comingSoon"));

  return (
    <div className="mx-auto w-full max-w-[1520px] p-4 sm:p-6 lg:p-8">
      <div className="mb-4">
        <KashBanner onBuy={comingSoon} />
      </div>

      <Eyebrow>{t("eyebrow")}</Eyebrow>

      <div className="mt-3.5 grid gap-3 lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_400px]">
        <BalanceCard onOpenFunds={onOpenFunds} onOpenWithdraw={onOpenWithdraw} />
        <KashCard />
      </div>

      <div className="mt-3">
        <CrossBorderBanner onClick={onOpenCrossBorder} />
      </div>

      {errored ? (
        <div className="ws-card mt-[18px] flex flex-col items-center gap-3 px-6 py-12 text-center">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-white/6">
            <WalletIcon size={22} />
          </div>
          <div className="ws-display text-[22px]">{t("errorTitle")}</div>
          <p className="max-w-[320px] text-[13.5px] font-normal text-white/55">{t("errorBody")}</p>
          <button
            onClick={() => refetch()}
            className="text-ink mt-1 cursor-pointer rounded-xl bg-white px-5 py-2.5 font-sans text-[13px] font-semibold hover:opacity-90"
          >
            {t("tryAgain")}
          </button>
        </div>
      ) : isEmpty ? (
        <div className="ws-card mt-[18px] flex flex-col items-center gap-3 px-6 py-12 text-center">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-white/6">
            <WalletIcon size={22} />
          </div>
          <div className="ws-display text-[22px]">{t("emptyTitle")}</div>
          <p className="max-w-[320px] text-[13.5px] font-normal text-white/55">{t("emptyBody")}</p>
          <button
            onClick={onOpenFunds}
            className="text-ink mt-1 cursor-pointer rounded-xl bg-white px-5 py-2.5 font-sans text-[13px] font-semibold hover:opacity-90"
          >
            {t("addFunds")}
          </button>
        </div>
      ) : (
        <div className="ws-card mt-[18px] overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-5 pb-3.5 sm:px-6">
            <span className="ws-display text-[22px]">{t("yourHoldings")}</span>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 text-[12.5px] font-normal whitespace-nowrap text-white/60">
                <span>{t("hideZeroValue")}</span>
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
                  placeholder={t("searchPlaceholder")}
                  className="w-[130px] min-w-0 border-none bg-transparent text-[13px] font-normal text-white outline-none"
                />
              </div>
            </div>
          </div>
          <div className="grid grid-cols-[1.7fr_auto] gap-3.5 px-4 pb-2.5 text-[11.5px] tracking-[0.04em] text-white/40 uppercase min-[560px]:grid-cols-[2fr_1fr_1fr_1fr_1fr] sm:px-6">
            <span>{t("asset")}</span>
            <span className="hidden min-[560px]:block">{t("type")}</span>
            {sortBtn("price", t("price"), "hidden justify-end text-right min-[560px]:flex")}
            <span className="hidden text-right min-[560px]:block">{t("network")}</span>
            {sortBtn("value", t("value"), "justify-end text-right")}
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
                ? t("noSearchMatches")
                : hideZero
                  ? t("noZeroHiddenAssets")
                  : t("noHoldingsYet")}
            </div>
          ) : (
            <>
              {holdingRows.map((row) => {
                const t = row.original;
                return (
                  <button
                    key={t.symbol + t.network}
                    onClick={() => openToken(t)}
                    className="grid w-full cursor-pointer grid-cols-[1.7fr_auto] items-center gap-3.5 border-t border-white/6 px-4 py-3.5 text-left transition-colors hover:bg-white/4 min-[560px]:grid-cols-[2fr_1fr_1fr_1fr_1fr] sm:px-6"
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <span className="relative shrink-0">
                        <AssetIcon
                          sym={t.symbol}
                          bg={tokenBg(t.symbol)}
                          logo={t.logo}
                          fallback="gradient"
                        />
                        <span className="absolute -right-1 -bottom-1 grid place-items-center rounded-full bg-[#0d0d0f] p-[1.5px]">
                          <NetworkIcon network={t.network} size={14} />
                        </span>
                      </span>
                      <span className="min-w-0">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate font-sans text-[14.5px] font-medium">
                            {t.symbol}
                          </span>
                          <span className="shrink-0 min-[560px]:hidden">
                            <TypeChip kind={t.kind} />
                          </span>
                        </span>
                        <span className="block truncate text-xs font-normal text-white/50">
                          {formatQty(t.balance)} · {networkLabel(t.network)}
                        </span>
                      </span>
                    </span>
                    <span className="hidden min-[560px]:flex">
                      <TypeChip kind={t.kind} />
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
                    {t("pageOfPages", { page: holdingsPage, pages: holdingsPages })}
                  </span>
                  <div className="flex gap-2">
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
            </>
          )}
        </div>
      )}

      {memeSell ? (
        <MemeTradeSheet
          token={toMemeToken(memeSell)}
          defaultSide="SELL"
          onClose={() => setMemeSell(null)}
        />
      ) : null}
    </div>
  );
}
