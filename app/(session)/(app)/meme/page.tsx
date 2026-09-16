"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import {
  MemeDesktopBoard,
  MEME_LIST_PAGE_SIZE,
  type MemeTradeSide,
} from "@/features/trade/components/meme-desktop-board";
import {
  MemeMarketMetrics,
  type MemeMarketMetricsData,
  type MemeMetricValue,
} from "@/features/trade/components/meme-market-metrics";
import { AppModalHost, useAppModals } from "@/components/layout/modals/app-modals";
import { MemeRiskSummary, QuoteExpiredNote } from "@/features/trade/components/meme-bits";
import { MemeRiskConsent } from "@/features/trade/components/meme-risk-consent";
import { MemeSellPanel } from "@/features/trade/components/meme-sell-panel";
import { MemeSettlementTracker } from "@/features/trade/components/meme-settlement-tracker";
import { MemeTradeSheet } from "@/features/trade/components/meme-trade-sheet";
import { useCatalogLookahead } from "@/features/trade/hooks/use-catalog-lookahead";
import {
  useMemeCatalog,
  useMemeSearch,
  useMemeToken,
} from "@/features/trade/hooks/use-meme-tokens";
import {
  memeOutcomeToast,
  useMemePreview,
  useMemeTrade,
  usePreviewRelink,
  type MemeTradeInput,
  type TradePhase,
} from "@/features/trade/hooks/use-meme-trade";
import { useRiskConsent } from "@/features/trade/hooks/use-risk-consent";
import { useCoingeckoId } from "@/hooks/use-coingecko-id";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useMarketHandoff } from "@/hooks/use-market-handoff";
import { usePortfolio } from "@/hooks/use-portfolio";
import { MemeCatalogMore, MemeViewSwitch } from "@/features/trade/components/meme-catalog-controls";
import { MemeScreenerToolbar } from "@/features/trade/components/meme-screener-toolbar";
import {
  MemeTrendingStrip,
  TRENDING_DESK_PAGE_SIZE,
} from "@/features/trade/components/meme-trending-strip";
import { useMemeScreener } from "@/features/trade/hooks/use-meme-screener";
import { DEFAULT_DISCOVERY_VIEW, catalogKey, type DiscoveryView } from "@/lib/meme/catalog";
import { heatShares, topGainerKeys } from "@/lib/meme/momentum";
import { scopeOf } from "@/lib/portfolio/fresh-scope";
import { displaySymbol } from "@/lib/buy";
import { friendlyError } from "@/lib/errors";
import { compactUsd, isValidTradeAmount, type MemeToken, type SwapPreview } from "@/lib/meme/api";
import { chartUp, platformFeeText } from "@/lib/meme/format";
import { SOLANA_CHAIN_ID, chainSlug, networkOf } from "@/lib/meme/chain";
import { buyFunding, estimateReceive, type BuyFunding } from "@/lib/meme/funding";
import { exceedsHeld } from "@/lib/meme/sell-amount";
import { toast } from "@/lib/toast";
import { belowMinimumBuy, minimumBuyUsd } from "@/lib/trade/minimums";

// Memecoins as their own page: the 2.0 desk, with the catalogue on the left and
// the coin being traded on the right. It is the md-and-up half of a pair; below
// md the Memecoins surface is the phone Market page's Memecoins tab, so this
// hands off to it (see useMarketHandoff) rather than drawing a phone layout.
//
// The four memecoin desktop frames in the design are one surface in three
// orthogonal states, not four screens: which side is selected, whether the
// chart is disclosed, and whether the market metrics are. So there is one
// route, one catalogue and one rail, and the state lives here because
// MemeDesktopBoard is presentational and owns none of it.

// Matches the trade sheet: long enough that typing an amount does not spend a
// quote per keystroke, short enough that the ticket settles while you look at
// it. The quote endpoint is rate limited at 20/min.
const PREVIEW_DEBOUNCE_MS = 600;

// USDC is the quote currency on both chains, so a buy is entered in USD at six
// decimals, whatever the coin's own precision.
const USD_DECIMALS = 6;

// The drawing area, and the height the whole chart area comes to once
// AssetChart's own range row is counted on top of it. The second figure is only
// ever used to hold that much space open while the coin's chart id resolves and
// when there is no chart to draw, so the rail does not jump as either settles.
const CHART_DRAW_HEIGHT = 186;
const CHART_AREA_HEIGHT = 248;

// The chart pulls lightweight-charts (~168KB), so it loads as its own chunk
// after the desk rather than inside the page's first bundle. The spot desk and
// the modal host load their charts the same way.
const AssetChart = dynamic(() => import("@/components/ui/asset-chart").then((m) => m.AssetChart), {
  ssr: false,
});

// compactUsd renders an em dash for anything it cannot show, null included, and
// a dash in the metrics panel reads as a real figure rather than as a missing
// one. So the absent case is decided here, before formatting, and the panel
// gets the null it treats as Unavailable.
function usdMetric(value: string | null): MemeMetricValue {
  return { display: value === null ? null : compactUsd(value) };
}

// The rail's market label. Every memecoin swap is quoted in USDC on both
// chains, so that is the other half of the pair.
function pairLabelFor(token: MemeToken): string {
  return `${displaySymbol(token.symbol ?? "") || "?"}/USDC`;
}

// A coin's chart, mounted only while the rail's chart row is open, so a
// collapsed chart resolves no id and subscribes to no series.
//
// Nothing is drawn around it. The rail is already a bordered panel, so the card
// this used to sit in (ChartPanelShell paints a surface, a hairline border, a
// rounded corner and an inset top highlight) read as a card inside a card. The
// spot desk mounts AssetChart straight into its ticket panel, and that is the
// reading asked for here, so the shell is gone from this screen.
//
// Its states are not. Two of them belonged to the id lookup and are drawn here:
// the lookup in flight, and a coin CoinGecko does not list. The shell's error
// state was already unreachable, because the resolver answers { id: null } on
// every failure rather than throwing, and that null lands in the same place as
// a miss. Everything past the id, the series loading, failing or coming back
// empty, is AssetChart's own, and it also draws the range row the design puts
// above the chart.
function MemeDeskChart({ token }: { token: MemeToken }) {
  const t = useTranslations("meme");
  // CoinGecko's asset platform ids are the same two slugs the trade service
  // uses for these chains.
  const { id, loading } = useCoingeckoId(chainSlug(token.chainId), token.address);
  // A change the service did not publish is not a gain: the chart draws neutral.
  const up = chartUp(token.priceChange24hPercent);

  return (
    <div data-region="meme-chart">
      {loading ? (
        <div role="status" aria-live="polite" style={{ height: CHART_AREA_HEIGHT }}>
          <span className="sr-only">{t("loading")}</span>
          <div aria-hidden="true" className="size-full animate-pulse rounded-[14px] bg-white/6" />
        </div>
      ) : id ? (
        <AssetChart coingeckoId={id} up={up} height={CHART_DRAW_HEIGHT} allowCandles={false} />
      ) : (
        <div
          style={{ height: CHART_AREA_HEIGHT }}
          className="grid place-items-center px-5 text-center text-[13.5px] font-normal text-white/45"
        >
          {t("noChart")}
        </div>
      )}
    </div>
  );
}

interface MemeBuyTicketProps {
  token: MemeToken;
  /** Controlled USD amount, so the desk can debounce it for the quote. */
  amount: string;
  onAmountChange: (amount: string) => void;
  /** What the buy can draw on, and whether it needs the Solana move first. */
  funding: BuyFunding;
  /** The live quote, or null: useMemePreview already blanks a lapsed one. */
  preview: SwapPreview | null;
  previewLoading: boolean;
  previewError: unknown;
  /** The quote lapsed at its expiresAt; the ticket says so and offers a fresh one. */
  quoteExpired: boolean;
  onRefreshQuote: () => void;
  onBuy: () => Promise<void>;
  phase: TradePhase;
  // The trade hook's failure as thrown; the ticket chooses the copy.
  error: unknown;
  // Opens the deposit flow. A buy the balance cannot cover grows a Top Up
  // button beside a disabled Buy; omit it and the button never appears.
  onAddFunds?: () => void;
}

const DECIMAL_INPUT = /^\d*\.?\d*$/;

// The buy side of the desk's ticket, drawn to match MemeSellPanel so the two
// halves of the switcher read as one control that changed side.
//
// Amounts here are USD, not the coin: the field, the balance and the minimum
// are all the dollar figure the user spends, and the coin's own precision only
// appears in the quote the service returns.
function MemeBuyTicket({
  token,
  amount,
  onAmountChange,
  funding,
  preview,
  previewLoading,
  previewError,
  quoteExpired,
  onRefreshQuote,
  onBuy,
  phase,
  error,
  onAddFunds,
}: MemeBuyTicketProps) {
  const t = useTranslations("meme");
  const tErr = useTranslations("tradeErrors");
  const [submitting, setSubmitting] = useState(false);

  const symbol = displaySymbol(token.symbol ?? "");
  const onSolana = token.chainId === SOLANA_CHAIN_ID;
  const amountValid = isValidTradeAmount(amount, USD_DECIMALS);
  const payUsd = amountValid ? Number(amount) : 0;
  const overBalance = amountValid && payUsd > funding.spendableUsd + 1e-9;
  const belowMin = belowMinimumBuy(payUsd, onSolana);
  const fundingBlocked = funding.needsFunding && !funding.canFund;

  const phaseBusy =
    phase === "linking" || phase === "quoting" || phase === "signing" || phase === "confirming";
  const busy = submitting || phaseBusy;
  const blocked = !token.buyEnabled || overBalance || belowMin || fundingBlocked;
  const disabled = busy || blocked || !amountValid;

  // The one block a deposit clears: the balance falls short, or a Solana buy
  // can't move enough USDC across. Only then, and only when the desk handed us
  // a deposit route, does the Top Up button stand beside Buy.
  const showTopUp = (overBalance || fundingBlocked) && onAddFunds != null;

  // A Solana buy that still needs its USDC moved cannot be quoted: the trade
  // service prices it against the Solana wallet, which does not hold the money
  // yet. Show what the listed price would deliver until it does.
  const estimate = funding.needsFunding ? estimateReceive(payUsd, token.priceUsd) : null;
  const quoteFailed =
    previewError != null && amountValid && !blocked && !previewLoading && !funding.needsFunding;

  const busyLabel = phaseBusy
    ? {
        linking: t("phaseLinking"),
        quoting: t("phaseQuoting"),
        signing: t("phaseSigning"),
        confirming: t("phaseConfirming"),
      }[phase as "linking" | "quoting" | "signing" | "confirming"]
    : t("buyingLabel");

  const ctaLabel = !token.buyEnabled
    ? t("sideDisabled")
    : overBalance || fundingBlocked
      ? t("notEnough")
      : belowMin
        ? t("minimumUsd", { amount: minimumBuyUsd(onSolana) })
        : busy
          ? busyLabel
          : t("ctaBuy", { symbol });

  async function submit() {
    if (disabled) return;
    setSubmitting(true);
    try {
      await onBuy();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="flex w-full flex-col gap-3">
      <div
        className={`bg-surface rounded-card border-2 p-4 ${
          overBalance || fundingBlocked ? "border-down/55" : "border-hairline"
        }`}
      >
        <div className="mb-3 flex items-center justify-between font-serif font-semibold">
          <span className="text-grey-400 text-[13px] tracking-[-0.39px]">{t("youPay")}</span>
          <span className="tnum text-grey-400 text-xs tracking-[-0.36px]">
            {t("balance", {
              amount: funding.spendableUsd.toLocaleString(undefined, {
                maximumFractionDigits: 2,
              }),
              symbol: "USD",
            })}
          </span>
        </div>

        <div className="flex items-center justify-between gap-3">
          <input
            value={amount}
            onChange={(e) => {
              const next = e.target.value.replace(/,/g, "");
              if (next === "" || DECIMAL_INPUT.test(next)) onAmountChange(next);
            }}
            aria-label={t("youPay")}
            inputMode="decimal"
            placeholder="0"
            className="ws-chewy tnum min-w-0 flex-1 bg-transparent text-[28px] text-white outline-none placeholder:text-white/30"
          />
          <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-[#1c1c1c] py-1.5 pr-3 pl-1.5">
            <span className="font-serif text-[13px] font-semibold tracking-[-0.39px] text-white">
              USD
            </span>
          </span>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            // Cents, floored: a full-balance buy must never round to a cent
            // more than the wallet holds.
            onClick={() =>
              onAmountChange((Math.floor(funding.spendableUsd * 100) / 100).toFixed(2))
            }
            disabled={funding.spendableUsd <= 0}
            className="bg-surface border-hairline cursor-pointer rounded-full border px-3 py-1 font-serif text-[11px] font-semibold text-white/70 hover:border-white/35 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t("max")}
          </button>
        </div>
      </div>

      <div className="border-hairline-amber rounded-card flex flex-col gap-2.5 border-2 bg-[#0a0a0a] p-4 font-serif text-sm font-semibold">
        <div className="flex items-center justify-between">
          <span className="text-grey-400">{t("youReceive")}</span>
          <span className="tnum text-white">
            {preview
              ? `${preview.expectedBuyAmountFormatted} ${displaySymbol(preview.buyToken.symbol ?? "")}`
              : estimate != null
                ? `≈ ${estimate.toLocaleString(undefined, { maximumFractionDigits: 4 })} ${symbol}`
                : previewLoading
                  ? "…"
                  : "—"}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-grey-400">{t("minReceived")}</span>
          <span className="tnum text-white">
            {preview
              ? `${preview.minimumBuyAmountFormatted} ${displaySymbol(preview.buyToken.symbol ?? "")}`
              : "—"}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-grey-400">{t("priceImpact")}</span>
          <span className="tnum text-white">
            {preview?.priceImpactBps != null
              ? `${(preview.priceImpactBps / 100).toFixed(2)}%`
              : "—"}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-grey-400">{t("slippage")}</span>
          <span className="tnum font-serif font-medium text-white">
            {preview ? `${(preview.slippageBps / 100).toFixed(2)}%` : "—"}
          </span>
        </div>
        {/* The fee the preview returned, never a rate the client assumes. */}
        <div className="flex items-center justify-between">
          <span className="text-grey-400">{t("platformFee")}</span>
          <span className="tnum text-white">
            {preview
              ? platformFeeText(preview.platformFeeAmountFormatted)
              : previewLoading
                ? "…"
                : "—"}
          </span>
        </div>
      </div>

      {quoteExpired ? <QuoteExpiredNote onRetry={onRefreshQuote} /> : null}
      <MemeRiskSummary token={token} />

      {funding.needsFunding && !fundingBlocked ? (
        <p className="text-[11.5px] font-normal text-white/45">{t("estimateNote")}</p>
      ) : null}
      {quoteFailed ? (
        <p className="text-down text-[12.5px] font-normal">
          {friendlyError(previewError, t("previewFailed"), tErr)}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-down text-[12.5px] font-normal">
          {friendlyError(error, t("orderFailed"), tErr)}
        </p>
      ) : null}

      {/* A buy the balance can't cover grows a Top Up button beside a disabled
          Buy, so the way forward lands where the dead button was rather than
          only in the "Not enough" line above. Precision and minimum blocks are
          the user's to fix, so only a shortfall opens the deposit route. */}
      <div className={`flex gap-3 ${showTopUp ? "" : "flex-col"}`}>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={disabled}
          className={`bg-buy h-12 rounded-3xl font-sans text-base font-semibold text-white ${
            showTopUp ? "flex-1" : "w-full"
          } ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:opacity-90"}`}
        >
          {ctaLabel}
        </button>
        {showTopUp ? (
          <button
            type="button"
            onClick={onAddFunds}
            className="h-12 flex-1 rounded-3xl border border-white/15 bg-white/5 font-sans text-base font-semibold text-white transition-colors hover:bg-white/10"
          >
            {t("topUp")}
          </button>
        ) : null}
      </div>
    </section>
  );
}

// The desk: the catalogue, the rail, and every piece of state the board reports
// back. Nothing below this holds server state; the board, the metrics panel,
// the chart frame and the sell ticket are all presentational.
function MemeDesk() {
  const t = useTranslations("meme");
  const tErr = useTranslations("tradeErrors");
  const tScreener = useTranslations("memeScreener");
  // "Add funds" the buy ticket hands upward opens here, the same deposit sheet
  // the RWA desk and dashboard use. The host is mounted at the foot of the desk.
  const modals = useAppModals();

  const [query, setQuery] = useState("");
  // The catalogue arrives whole and is cut into pages here, so the list ends on
  // a row boundary instead of clipping one against the panel's fixed height.
  // The board draws the bar but holds no page of its own.
  const [requestedPage, setRequestedPage] = useState(1);
  // How many rows the board can actually show. The design's ten is the starting
  // value and what the server renders; the board measures the space it was
  // given and reports back, because the panel stretches to the window and ten
  // rows left the bottom of a tall card empty. The route has to hold it: the
  // slice below happens here, so a board told to draw fifteen rows would still
  // only be handed ten.
  const [listPageSize, setListPageSize] = useState(MEME_LIST_PAGE_SIZE);
  const [picked, setPicked] = useState<MemeToken | null>(null);
  const [side, setSide] = useState<MemeTradeSide>("BUY");
  // The rail opens on the chart: the price is what someone checks before a
  // trade. Closing it still unmounts the chart (see MemeDeskChart).
  const [chartOpen, setChartOpen] = useState(true);
  const [metricsOpen, setMetricsOpen] = useState(false);
  const [amount, setAmount] = useState("");
  // A Solana order is finished in the sheet; see runTrade below.
  const [sheetToken, setSheetToken] = useState<MemeToken | null>(null);

  // The catalogue a server page of 500 at a time, judged by the Curated / All
  // view; the phone's grid reads the same pages, so both share one cache entry.
  const [view, setView] = useState<DiscoveryView>(DEFAULT_DISCOVERY_VIEW);
  const catalog = useMemeCatalog({ view });
  const search = useMemeSearch(query, view);
  // Trending and the market screener. While filters or a sort apply, the
  // screener's filtered list stands in for the catalogue everywhere the list
  // reads it: rows, paging, the count and the lookahead. A search still takes
  // priority over both.
  const screener = useMemeScreener({ view, trendingPageSize: TRENDING_DESK_PAGE_SIZE });
  const source = screener.active ? screener.list : catalog;
  const portfolio = usePortfolio();
  const { walletFor, phase, error, trade, linkForPreview } = useMemeTrade();

  const rows = search.active ? search.results : source.tokens;
  // The picked coin stays picked while a search narrows the list, but takes
  // the fresher row whenever the catalogue still carries it.
  const sameCoin = (a: MemeToken, b: MemeToken) =>
    a.address === b.address && a.chainId === b.chainId;
  const listed = picked ? (rows.find((row) => sameCoin(row, picked)) ?? picked) : (rows[0] ?? null);
  // The desk trades on a fresh read of the coin, as the sheet does: a catalogue
  // row can be minutes old, and its risk block and buy/sell switches are what
  // the ticket acts on. The listed row stands in until the read lands, and a
  // read for another coin never stands in for this one.
  const { token: freshRead } = useMemeToken(listed);
  const selected = listed && freshRead && sameCoin(freshRead, listed) ? freshRead : listed;

  // A new search, a new view or newly applied filters make a different list, so
  // the page someone was on says nothing about where to open it. A page loaded
  // ahead appends to the same list, so it keeps the page.
  const listKey = `${view}|${query}|${screener.resetKey}`;
  const [pagedList, setPagedList] = useState(listKey);
  if (listKey !== pagedList) {
    setPagedList(listKey);
    setRequestedPage(1);
  }

  // The page is clamped for display rather than stored clamped, so a list that
  // shrinks under someone parked on a later page lands them on the last one
  // instead of on an empty panel. Selection still reads the whole list above,
  // not this slice, so a coin stays in the rail while the catalogue is paged
  // past it.
  const pageCount = Math.max(1, Math.ceil(rows.length / listPageSize));
  const page = Math.min(Math.max(1, requestedPage), pageCount);
  const pageRows = useMemo(
    () => rows.slice((page - 1) * listPageSize, page * listPageSize),
    [rows, page, listPageSize]
  );
  const topGainers = useMemo(
    () => topGainerKeys(pageRows, screener.timeframe),
    [pageRows, screener.timeframe]
  );
  // Heat is measured against every trending coin, not just the page showing.
  const trendingHeat = useMemo(
    () => heatShares(screener.trending.tokens, screener.timeframe),
    [screener.trending.tokens, screener.timeframe]
  );

  // No "Load more": the next server page is fetched in the background while
  // the reader is within a few pages of the end of what has loaded, so the
  // numbered bar always has pages ahead to show. A search is its own complete
  // list, so the catalogue is left alone while one is showing.
  const catalogPaging = !search.active;
  const lookahead = useCatalogLookahead({
    enabled: catalogPaging,
    pagesAhead: pageCount - page,
    loaded: source.loaded,
    shownCount: source.shownCount,
    hasMore: source.hasMore,
    isLoading: source.isLoading,
    isLoadingMore: source.isLoadingMore,
    failed: source.loadMoreFailed,
    loadMore: source.loadMore,
  });

  function changePage(next: number) {
    setRequestedPage(next);
    // Past the last loaded page is the reader asking for rows that are not
    // here yet. The lookahead may have paused on a run of empty server pages,
    // so this asks outright; the page shows once its rows arrive.
    if (next > pageCount && catalogPaging) lookahead.requestMore();
  }

  const debouncedAmount = useDebouncedValue(amount, PREVIEW_DEBOUNCE_MS);
  const buying = side === "BUY";
  const wallet = selected ? walletFor(selected.chainId) : null;

  // The user has one USD balance, their Base USDC. A coin on Solana is paid for
  // by moving that USDC across first, so on Solana both sides count as
  // spendable. Which chain any of it sits on is never shown.
  const usdcOn = (network: string) =>
    portfolio.tokens.find((p) => p.network === network && p.symbol.toUpperCase() === "USDC")
      ?.balance ?? 0;
  const funding = buyFunding({
    chainId: selected?.chainId ?? 0,
    payUsd: isValidTradeAmount(debouncedAmount, USD_DECIMALS) ? Number(debouncedAmount) : 0,
    baseUsdc: usdcOn("base-mainnet"),
    solanaUsdc: usdcOn("solana-mainnet"),
  });

  // The wallet's holding of the selected coin, in exact base units. A float
  // here would lose real digits: a memecoin balance routinely runs past 2^53
  // base units.
  const network = selected ? networkOf(selected.chainId) : null;
  const onSolana = selected?.chainId === SOLANA_CHAIN_ID;
  const held =
    selected && network
      ? portfolio.tokens.find(
          (p) =>
            p.network === network &&
            (onSolana
              ? p.address === selected.address
              : p.address?.toLowerCase() === selected.address.toLowerCase())
        )
      : undefined;
  const heldRaw = held?.rawBalance ?? "0";
  const heldDecimals = held?.decimals ?? selected?.decimals ?? 18;

  const maxDecimals = buying ? USD_DECIMALS : heldDecimals;
  const amountValid = isValidTradeAmount(debouncedAmount, maxDecimals);
  const sideEnabled = selected ? (buying ? selected.buyEnabled : selected.sellEnabled) : false;
  const overBalance =
    amountValid &&
    (buying
      ? Number(debouncedAmount) > funding.spendableUsd + 1e-9
      : exceedsHeld(debouncedAmount, heldRaw, heldDecimals));
  const belowMin = buying && belowMinimumBuy(Number(debouncedAmount || "0"), Boolean(onSolana));

  // The quote is only worth asking for once the order could actually be placed.
  // A Solana buy short of its USDC is the one case the service refuses outright.
  const previewInput =
    selected &&
    wallet &&
    amountValid &&
    sideEnabled &&
    !overBalance &&
    !belowMin &&
    !funding.needsFunding
      ? {
          side,
          tokenAddress: selected.address,
          amount: debouncedAmount,
          walletAddress: wallet,
          chainId: selected.chainId,
        }
      : null;
  // A LOW_LIQUIDITY coin is confirmed before any preview goes out, and so before
  // any quote: the dialog opens the first time an amount is typed for it, and
  // Cancel clears the amount. A coin without that warning never sees it.
  const consent = useRiskConsent(selected, amount);
  const preview = useMemePreview(previewInput, consent.consented);
  // A never-linked wallet's first preview is refused; link it and ask again.
  usePreviewRelink(preview.error, selected?.chainId ?? null, linkForPreview, preview.refetch);

  function selectToken(token: MemeToken) {
    setPicked(token);
    // The amount means a different thing on each coin and on each side, so it
    // never carries over.
    setAmount("");
  }

  function changeSide(next: MemeTradeSide) {
    setSide(next);
    setAmount("");
  }

  // Base executes here. A Solana order does not: buying one may need the USDC
  // moved to the Solana wallet first, and selling one has to record what the
  // sale should deliver so the settlement tracker can route the proceeds back
  // to the USD balance. Both of those live in MemeTradeSheet, so a Solana order
  // is handed there rather than run here with half the plumbing.
  async function runTrade(input: MemeTradeInput) {
    // No quote for a LOW_LIQUIDITY coin the user has not confirmed.
    if (!selected || !consent.consented) return;
    if (input.chainId === SOLANA_CHAIN_ID) {
      setSheetToken(selected);
      return;
    }
    const symbol = displaySymbol(selected.symbol ?? "");
    // USDC leaves Base and the token lands on the trade's own chain.
    const tradedNetworks = scopeOf("base-mainnet", networkOf(input.chainId));
    const toastId = toast.loading(
      input.side === "BUY" ? t("buyingToast", { symbol }) : t("sellingToast", { symbol })
    );
    try {
      const result = await trade(input);
      toast.success(memeOutcomeToast(t, result, input.side, symbol), { id: toastId });
      setAmount("");
      void portfolio.refetchUntilChanged(tradedNetworks);
    } catch (e) {
      // The trade hook keeps the failure for the ticket's inline error; the
      // toast is for the case where the user has already looked away.
      toast.error(friendlyError(e, t("orderFailed"), tErr), { id: toastId });
      void portfolio.refetchFresh(tradedNetworks);
    }
  }

  const metrics: MemeMarketMetricsData | null = selected
    ? {
        marketCap: usdMetric(selected.marketCapUsd),
        volume24h: usdMetric(selected.volume24hUsd),
        liquidity: usdMetric(selected.liquidityUsd),
        // The service publishes neither a listing date nor a buy/sell trader
        // split. Both tiles stay, and say Unavailable: a zero age or an empty
        // split would read as a fact about the coin.
        ageDays: null,
        traders: null,
      }
    : null;

  return (
    // The desk is as tall as the window under the topbar, because nothing
    // between the two passes a height down: the shell's main carries
    // min-h-screen, which makes the black page that tall, not the desk sitting
    // in it. So the list card ended at its rows with the page showing beneath
    // it, and the `self-stretch` inside the board had no height to stretch to.
    //
    // The figure is the window less what is above and below the desk in the
    // shell: the topbar is 79px from md up, and main reserves whatever the
    // broadcast dock is holding at the foot of the page in --ws-live-bar, which
    // the dock rewrites on the root element as a broadcast starts and stops, so
    // reading it here keeps the desk correct without measuring anything. The
    // desk's own padding is inside the figure, border-box, so the card keeps the
    // same gutter under it as it has beside it.
    //
    // A floor, not a fixed height: a rail with the chart and the metrics both
    // open is taller than a short window, and the desk has to grow and let the
    // page scroll rather than crop the rail. `min-h` only ever hands down
    // spare height, so nothing below can be squeezed under its own content.
    //
    // 100dvh rather than 100vh: vh is the tall viewport on a mobile browser,
    // which overshoots by the address bar. `md:` because both figures are the
    // desktop shell's, and this desk only ever renders at md and up: below it
    // the page hands off to the phone Market page.
    <div
      data-region="meme-desk"
      className="mx-auto flex w-full max-w-[1520px] flex-col overflow-x-auto p-4 sm:p-6 md:min-h-[calc(100dvh-79px-var(--ws-live-bar,0px))] lg:p-8"
    >
      <MemeDesktopBoard
        tokens={pageRows}
        selected={selected}
        onSelect={selectToken}
        query={query}
        onQueryChange={setQuery}
        isLoading={search.active ? search.searching : source.isLoading}
        failed={search.active ? !!search.error : !!source.error}
        // A failed search may sit on a healthy catalogue, so the way back there
        // is clearing the search rather than asking again.
        onRetry={search.active ? () => setQuery("") : () => void source.refetch()}
        // A filtered list that comes back empty or fails says so in the
        // screener's words, not as though the whole catalogue were empty or down.
        emptyText={!search.active && screener.active ? tScreener("noMatches") : undefined}
        unavailableText={
          !search.active && screener.active ? tScreener("listUnavailable") : undefined
        }
        page={page}
        pageCount={pageCount}
        onPageChange={changePage}
        pageMore={catalogPaging && source.hasMore}
        pageLoadingMore={catalogPaging && source.isLoadingMore}
        onPageSizeChange={setListPageSize}
        listControls={<MemeViewSwitch value={view} onChange={setView} />}
        trending={
          <MemeTrendingStrip
            variant="desk"
            tokens={screener.trending.pageTokens}
            rankOffset={(screener.trending.page - 1) * TRENDING_DESK_PAGE_SIZE}
            heat={trendingHeat}
            timeframe={screener.timeframe}
            page={screener.trending.page}
            pages={screener.trending.pages}
            onPageChange={screener.trending.setPage}
            filtered={screener.trending.filtered}
            isLoading={screener.trending.isLoading}
            error={screener.trending.error}
            onRetry={screener.trending.refetch}
            selectedKey={selected ? catalogKey(selected) : null}
            // A card picks its coin into the rail, as a row does.
            onSelect={selectToken}
          />
        }
        screener={
          <MemeScreenerToolbar
            variant="desk"
            timeframe={screener.timeframe}
            onTimeframeChange={screener.setTimeframe}
            filters={screener.filters}
            count={screener.count}
            preset={screener.preset}
            onApply={screener.apply}
            onSortChange={screener.setSort}
            onPreset={screener.applyPreset}
            onClearBound={screener.clearBound}
            onClearAll={screener.clearAll}
            paused={search.active}
          />
        }
        timeframe={screener.timeframe}
        sortMetric={screener.filters.sort?.by ?? null}
        sortOrder={screener.filters.sort?.order ?? "desc"}
        onSortChange={screener.setSort}
        topGainers={topGainers}
        listStatus={
          // The count describes the catalogue; a search replaces it, so it
          // steps aside while one is showing. Pages load ahead on their own, so
          // the strip only offers a retry, for a page that failed.
          search.active ? null : (
            <MemeCatalogMore
              loaded={source.loaded}
              total={source.total}
              shownCount={source.shownCount}
              hasMore={source.hasMore}
              loadingMore={source.isLoadingMore}
              failed={source.loadMoreFailed}
              onLoadMore={lookahead.requestMore}
              autoLoads
            />
          )
        }
        pairLabel={selected ? pairLabelFor(selected) : undefined}
        side={side}
        onSideChange={changeSide}
        chartOpen={chartOpen}
        onChartToggle={() => setChartOpen((open) => !open)}
        chart={selected ? <MemeDeskChart token={selected} /> : null}
        metricsOpen={metricsOpen}
        onMetricsToggle={() => setMetricsOpen((open) => !open)}
        metrics={
          // The rail draws the "Market Metrics" row, so the panel's own trigger
          // would be a second control for one disclosure. showTrigger turns it
          // off rather than a CSS rule reaching into the component's markup,
          // which would break the moment that markup changed. The panel keeps
          // its trigger by default, for a screen with no rail to put one in.
          <MemeMarketMetrics
            expanded={metricsOpen}
            onToggle={(next) => setMetricsOpen(next)}
            metrics={metrics}
            showTrigger={false}
          />
        }
        ticket={
          selected ? (
            buying ? (
              <MemeBuyTicket
                token={selected}
                amount={amount}
                onAmountChange={setAmount}
                funding={funding}
                preview={preview.quote}
                previewLoading={preview.isFetching}
                previewError={preview.error}
                quoteExpired={preview.expired}
                onRefreshQuote={() => void preview.refetch()}
                onBuy={() =>
                  // The amount in the field, not the debounced copy the quote
                  // was asked for: the sell ticket sends what it shows, and a
                  // buy placed inside the debounce window must not send the
                  // previous figure. The service prices the order itself.
                  runTrade({
                    side: "BUY",
                    tokenAddress: selected.address,
                    amount,
                    chainId: selected.chainId,
                  })
                }
                phase={phase}
                error={error}
                onAddFunds={modals.openFunds}
              />
            ) : (
              <MemeSellPanel
                token={selected}
                balanceRaw={heldRaw}
                balanceDecimals={heldDecimals}
                amount={amount}
                onAmountChange={setAmount}
                preview={preview.quote}
                previewLoading={preview.isFetching}
                previewError={preview.error}
                quoteExpired={preview.expired}
                onRefreshQuote={() => void preview.refetch()}
                onSell={runTrade}
                phase={phase}
                error={error}
              />
            )
          ) : null
        }
      />

      {sheetToken ? (
        <MemeTradeSheet
          token={sheetToken}
          defaultSide={side}
          onClose={() => setSheetToken(null)}
          onTopUp={modals.openFunds}
        />
      ) : null}

      {selected ? (
        <MemeRiskConsent
          open={consent.prompting}
          token={selected}
          onContinue={consent.accept}
          onCancel={() => setAmount("")}
        />
      ) : null}

      {/* Hosts the deposit sheet the buy ticket's "Add funds" opens. */}
      <AppModalHost
        active={modals.modal}
        onClose={modals.close}
        onConfirmed={modals.showDone}
        onOpenFunds={modals.openFunds}
      />
    </div>
  );
}

// The auth guard and the app shell come from the (app) layout. The settlement
// tracker finishes any Solana purchase whose USD is still on its way, and is
// mounted on the dashboard too.
export default function MemePage() {
  const handingOff = useMarketHandoff("memecoins");

  // Below md this hands off to /market; render nothing meanwhile so the desk is
  // never painted at phone width before the redirect lands.
  if (handingOff) return null;

  return (
    <>
      <MemeDesk />
      <MemeSettlementTracker />
    </>
  );
}
