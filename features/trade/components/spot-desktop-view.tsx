"use client";

import dynamic from "next/dynamic";
import { useMemo, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";

import { AsyncEmpty, AsyncError } from "@/components/ui/async-state";
import { SearchField } from "@/components/ui/search-field";
import { SpotAmountCard } from "@/features/trade/components/spot-amount-card";
import {
  SpotAssetTable,
  spotAssetPageCount,
  spotAssetPageRows,
  SPOT_ASSET_PAGE_SIZE,
  SPOT_ASSET_ROW_HEIGHT,
} from "@/features/trade/components/spot-asset-table";
import {
  SPOT_ASSET_COLUMNS,
  type SpotAssetRowView,
} from "@/features/trade/components/spot-asset-row";
import type { SpotChangeDirection } from "@/features/trade/components/spot-pair-header";
import { SpotOrderSummary } from "@/features/trade/components/spot-order-summary";
import { SpotPairHeader } from "@/features/trade/components/spot-pair-header";
import {
  SpotQuickAmounts,
  SPOT_QUICK_AMOUNTS,
} from "@/features/trade/components/spot-quick-amounts";
import { SpotTradeActions } from "@/features/trade/components/spot-trade-actions";
import { useSpotBuy } from "@/features/trade/hooks/use-spot-buy";
import { useSpotMarkets, type SpotMarket } from "@/features/trade/hooks/use-spot-markets";
import { useFittedRowCount } from "@/hooks/use-fitted-row-count";
import { usePortfolio } from "@/hooks/use-portfolio";
import { formatCompactUsd, formatUsd, fromBaseUnits, toBaseUnits } from "@/lib/trade/math";
import { toast } from "@/lib/toast";
import type { SellPayload } from "@/lib/modal-types";

// Dynamic: the chart pulls lightweight-charts (~168KB) and the panel starts
// collapsed, so the bundle only arrives once someone opens "View Chart". The
// same reason the modal host and the pro desk load their charts this way.
const AssetChart = dynamic(() => import("@/components/ui/asset-chart").then((m) => m.AssetChart), {
  ssr: false,
});

// Every spot order is paid for in USDC on Base, the same rail the buy sheet
// uses. The desk has no other pay token, so the ticket names one.
const PAY_SYMBOL = "USDC";
const PAY_NETWORK = "base-mainnet";
const PAY_DECIMALS = 6;

// The flat rate the desk quotes on a buy, matching the figure the mobile spot
// ticket shows (spot-panel.tsx). It is an estimate for the summary line, not
// the amount deducted: the router prices the real fee at fill.
const FEE_BPS = 10n;
const BPS = 10_000n;

// The two columns. The ticket column holds the order form and its controls, so
// it takes the sized track and the market list absorbs the rest.
//
// The split changed on user feedback: the list was too wide and the ticket too
// narrow for what it carries. The ticket is now 40% of the content column,
// floored at the 430px it used to be and capped at 480px. Measured in the app
// shell, that is 430px below about a 1390px window, 451px at 1440px, and 480px
// from 1512px up to the container's 1520px maximum, where the list takes 960px
// instead of the 1010px it had. The floor is what keeps the desk's minimum
// width where it was, since nothing below 1390px gets narrower. The list carries
// 410px of fixed price, change and market cap columns, so at the xl breakpoint
// it is already down to 522px, and taking another 50px off the asset name there
// would leave it nothing to sit in.
//
// One track rather than a second breakpoint: Tailwind emits an arbitrary
// `min-[1440px]:` rule ahead of the named `xl:` one, so a wider track declared
// that way loses to the narrower one at every width. Measured, not assumed.
//
// The row stretches, and the market list is the panel that answers to it.
// SpotAssetTable carries `self-stretch` and grows the region above its pager, so
// it fills the row and reaches the bottom of the window.
//
// The ticket opts out with `self-start` on the aside itself. It was stretching
// too, which on a 900px window left roughly 110px of empty card between the
// quick amounts and the purchase summary the `mt-auto` block pins to the foot.
// The stretch is removed at the one panel that must not have it rather than by
// turning the whole row to `items-start`: the row's alignment is then still the
// grid default that anything else dropped into it inherits, and the list does
// not end up relying on its own `self-stretch` alone to fill the window.
//
// `grow` is the last link in the chain that carries the viewport's height down
// to the panels: the desk container is at least a screen tall from xl up, the
// column inside it grows to that height, and this grid takes what the search
// field leaves. A grid whose single implicit row is auto sized stretches that
// row to fill the container, and `items-stretch` then hands the height to the
// list. Below xl the container has no minimum height, so `grow` finds no free
// space and the stacked page keeps scrolling normally.
const DESK_GRID =
  "grid grow items-stretch gap-4 xl:grid-cols-[minmax(0,1fr)_clamp(430px,40%,480px)]";

// The order ticket's own box, shared with the loading skeleton so the two stand
// at the same width and the same floor.
const TICKET_PANEL =
  "border-hairline bg-surface flex flex-col self-start rounded-3xl border p-[11px] xl:min-h-[590px]";

// The width DESK_GRID puts the two columns side by side at, which is Tailwind's
// `xl`.
const SIDE_BY_SIDE = "(min-width: 1280px)";

function subscribeToDeskWidth(notify: () => void): () => void {
  const query = window.matchMedia(SIDE_BY_SIDE);
  query.addEventListener("change", notify);
  return () => query.removeEventListener("change", notify);
}

// True once the desk lays its two columns out side by side.
//
// Only then is the desk a screen tall, and only then is there spare panel height
// for the market list to fill: below xl the columns stack, the container drops
// its minimum height and the page scrolls, so the list keeps the design's nine
// rows. Measuring there would read the rows' own height back and drift a row at
// a time, which is exactly the runaway useFittedRowCount warns about.
//
// The server has no viewport and answers false, which is also what the fitted
// count falls back to, so the first client render matches the HTML it hydrates
// and the correction happens after. Same trade-off useIsMobile makes; this one
// stays local because it is one desk's breakpoint, not a shared rule.
function useSideBySideDesk(): boolean {
  return useSyncExternalStore(
    subscribeToDeskWidth,
    () => window.matchMedia(SIDE_BY_SIDE).matches,
    () => false
  );
}

const CHART_PANEL_ID = "spot-desk-chart";

// Signed percentage, two decimals, the way the design writes it ("+2.52%").
function changeLabel(change24h: number): string {
  const value = Number.isFinite(change24h) ? change24h : 0;
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

// An exact zero and an unknown move are both "flat": neither is a gain, and
// painting them green would say something the data does not.
function changeDirection(change24h: number): SpotChangeDirection {
  if (!Number.isFinite(change24h) || change24h === 0) return "flat";
  return change24h > 0 ? "up" : "down";
}

// A USDC figure from its own base units, grouped in threes and always carrying
// both cents. The digits come from the string form, so no float ever holds an
// amount of money on the way to the screen.
function usdcLabel(units: bigint): string {
  const [whole = "0", frac = ""] = fromBaseUnits(units, PAY_DECIMALS).split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${grouped}.${(frac + "00").slice(0, 2)}`;
}

function toRowView(market: SpotMarket): SpotAssetRowView {
  return {
    id: market.symbol,
    symbol: market.symbol,
    name: market.name,
    logo: market.logo,
    price: market.priceUsd > 0 ? formatUsd(market.priceUsd) : "—",
    change24h: changeLabel(market.change24h),
    changeDirection: changeDirection(market.change24h),
    marketCap: market.marketCap > 0 ? formatCompactUsd(market.marketCap) : "—",
  };
}

export interface SpotDesktopViewProps {
  // Selling is the sheet's job: it needs the origin network, the gas check and
  // the exact held balance, none of which belong on a buy ticket. The page
  // above owns the modal host, so the request goes up.
  onSell: (payload: SellPayload) => void;
}

// The desktop Spot desk: the market list on the left, the order ticket on the
// right with the chart folded into it, one search field over both. This is the
// composition layer, so it is the only file here that holds hooks: the children
// below it take finished strings and report events, and never fetch or format
// anything themselves.
//
// Phones keep the existing SpotSection. The page picks between them.
export function SpotDesktopView({ onSell }: SpotDesktopViewProps) {
  const t = useTranslations("spot");
  const { markets, destinations, loading, error } = useSpotMarkets();
  const portfolio = usePortfolio();

  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [requestedPage, setRequestedPage] = useState(1);
  const [chartExpanded, setChartExpanded] = useState(false);
  const [amount, setAmount] = useState("");

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return markets;
    return markets.filter(
      (m) => m.symbol.toLowerCase().includes(needle) || m.name.toLowerCase().includes(needle)
    );
  }, [markets, query]);

  // A new search starts at the first page: the results are a different list, so
  // the page someone was on says nothing about where to open the new one.
  const [pagedQuery, setPagedQuery] = useState(query);
  if (query !== pagedQuery) {
    setPagedQuery(query);
    setRequestedPage(1);
  }

  // How many rows the list panel can hold at this window height. The table
  // hands back the block its rows sit in, whose height comes from the panel and
  // never from the rows themselves, so a bigger page cannot make the box the
  // count is read from any taller. Below xl nothing is measured and the design's
  // nine stand.
  //
  // Measured in Chrome at 1440px wide: ten rows in a 900px window and fifteen
  // in a 1200px one, against the nine the frame was drawn at, which is the 73px
  // of empty card that stood between the last row and the pager at 900.
  //
  // The cost is that opening the chart repaginates the list. The chart makes the
  // ticket taller than the window's own spare height, the row grows to the
  // ticket, and the list grows with it: at 900px the page goes from ten rows to
  // twelve, so rows move under the reader and "Page 1 of 4" becomes "Page 1 of
  // 3". The empty band was the louder of the two defects, and the pager stays
  // honest about where the reader is. The memecoin desk made the same trade.
  const { ref: rowsRef, rows: pageSize } = useFittedRowCount<HTMLDivElement>({
    rowHeight: SPOT_ASSET_ROW_HEIGHT,
    fallbackRows: SPOT_ASSET_PAGE_SIZE,
    enabled: useSideBySideDesk(),
  });

  // The table pages but holds no page, so the number, its bounds and the slice
  // all live here. Building every row view up front costs nothing per page: the
  // memo only reruns when the markets or the search change, and paging is then a
  // slice. The page is clamped rather than stored clamped, so a catalogue that
  // shrinks under someone parked on a later page lands them on the last one
  // instead of on an empty panel. A window that grows takes pages away the same
  // way, and the clamp is what carries that viewer back to the new last page.
  const allRows = useMemo(() => filtered.map(toRowView), [filtered]);
  const pageCount = spotAssetPageCount(allRows.length, pageSize);
  const currentPage = Math.min(Math.max(1, requestedPage), pageCount);
  const rows = useMemo(
    () => spotAssetPageRows(allRows, currentPage, pageSize),
    [allRows, currentPage, pageSize]
  );

  // A search narrows the list, never the ticket: the market someone is part way
  // through pricing stays open even once it scrolls out of the results.
  const selected = useMemo(() => {
    const chosen = selectedId ? markets.find((m) => m.symbol === selectedId) : undefined;
    return chosen ?? filtered[0] ?? markets[0] ?? null;
  }, [selectedId, markets, filtered]);

  // Clear the amount when the market changes, so a figure meant for one asset
  // never carries into another. Same guard the mobile ticket runs.
  const [pricedMarket, setPricedMarket] = useState(selected?.symbol ?? "");
  if ((selected?.symbol ?? "") !== pricedMarket) {
    setPricedMarket(selected?.symbol ?? "");
    setAmount("");
  }

  // Spendable USDC as exact base units. usePortfolio also carries a float
  // `balance` for display, but the amount card compares against what was typed,
  // and that comparison has to be integer arithmetic.
  const payBalance = useMemo(
    () =>
      portfolio.tokens
        .filter((token) => token.symbol === PAY_SYMBOL && token.network === PAY_NETWORK)
        .reduce((sum, token) => sum + BigInt(token.rawBalance), 0n),
    [portfolio.tokens]
  );

  const buy = useSpotBuy({
    symbol: selected?.symbol ?? "",
    name: selected?.name ?? "",
    amount,
  });

  const amountUnits = toBaseUnits(amount, PAY_DECIMALS);
  const feeUnits = (amountUnits * FEE_BPS) / BPS;

  // The largest holding of the selected asset, whichever chain it sits on. Null
  // when the wallet holds none, which is what makes Sell explain itself instead
  // of opening a sheet with nothing to sell.
  const held = useMemo(() => {
    if (!selected) return null;
    return (
      portfolio.tokens
        .filter((token) => token.symbol === selected.symbol && token.balance > 0)
        .sort((a, b) => b.balance - a.balance)[0] ?? null
    );
  }, [portfolio.tokens, selected]);

  const requestSell = () => {
    if (!selected) return;
    if (!held) {
      toast.error(t("noSellBalance", { symbol: selected.symbol }));
      return;
    }
    onSell({
      symbol: held.symbol,
      name: held.name,
      network: held.network,
      address: held.address,
      decimals: held.decimals,
      balance: held.balance,
      rawBalance: held.rawBalance,
      priceUsd: held.priceUsd > 0 ? held.priceUsd : selected.priceUsd,
      logo: held.logo ?? selected.logo,
    });
  };

  // The desk is a screen tall from xl up, which is what lets the market list
  // reach the bottom of the window instead of stopping under its ninth row.
  // Stretching the panel inside the grid row was not enough on its own:
  // nothing between the viewport and this container passes a height down, so
  // the row was only ever as tall as its taller child and the window below it
  // was page background.
  //
  // The subtraction is short because this box is the one the height is set
  // on. Border-box sizing puts its own p-8 inside the figure, so the padding
  // is spent from the screen rather than added to it, and the shell's main
  // already reserves the broadcast bar as its own bottom padding, so only the
  // topbar (79px from md up, in flow above this) and that same bar come off.
  // Topbar plus this container then comes to exactly main's content box, and
  // the page does not scroll when nothing overflows.
  //
  // dvh, not vh: on a mobile browser vh is the tallest the viewport ever gets
  // and would run the desk under the browser's own chrome. min-h, not h, so a
  // window too short for the desk grows the container and scrolls the page
  // instead of spilling rows out of the panel. And xl only, because below it
  // the two columns stack, and a stacked desk pinned to the viewport would put
  // the ticket permanently below the fold.
  return (
    <div className="mx-auto flex w-full max-w-[1520px] flex-col p-4 sm:p-6 lg:p-8 xl:min-h-[calc(100dvh-79px-var(--ws-live-bar,0px))]">
      <div className="flex grow flex-col gap-4">
        <SearchField
          value={query}
          onChange={setQuery}
          label={t("searchPlaceholder")}
          placeholder={t("searchPlaceholder")}
          disabled={loading || error}
          className="max-w-[394px]"
        />

        {error ? (
          <AsyncError
            error={destinations.error}
            subject="the spot markets"
            unconfiguredDetail={t("unavailable")}
            onRetry={() => void destinations.refetch()}
          />
        ) : loading ? (
          <DeskSkeleton label={t("loadingMarkets")} rows={pageSize} rowsRef={rowsRef} />
        ) : markets.length === 0 ? (
          <AsyncEmpty>{t("noMarkets")}</AsyncEmpty>
        ) : (
          // The two panels sit side by side only once the content column is wide
          // enough for the ticket's own width plus a readable market list. Below
          // that they stack, which is also what the md..xl tablet range gets.
          <div className={DESK_GRID}>
            {/* The left column is the market list alone. */}
            <SpotAssetTable
              rows={rows}
              selectedId={selected?.symbol ?? null}
              onSelect={setSelectedId}
              page={currentPage}
              pageCount={pageCount}
              onPageChange={setRequestedPage}
              rowsRef={rowsRef}
            />

            <aside className={`${TICKET_PANEL} gap-[27px]`}>
              {selected ? (
                <>
                  {/* The pill names the token alone, not a pair. USDC is the
                      only thing this desk pays with, so "/USDC" repeated the
                      one fact every line of the ticket below already states,
                      and it is not a market someone can pick either: the list
                      on the left is the picker. */}
                  <SpotPairHeader
                    symbol={selected.symbol}
                    change24h={changeLabel(selected.change24h)}
                    changeDirection={changeDirection(selected.change24h)}
                    chartExpanded={chartExpanded}
                    onToggleChart={() => setChartExpanded((open) => !open)}
                    chartPanelId={CHART_PANEL_ID}
                  />

                  {/* The chart opens inside the ticket, directly under the
                      disclosure that names it and beside the badge naming the
                      token it is drawn from, so it needs no label of its own.

                      The panel stays in the tree so aria-controls always
                      resolves; only the chart itself, and the request behind
                      it, wait for the open. A collapsed chart subscribes to
                      nothing. */}
                  <div id={CHART_PANEL_ID} hidden={!chartExpanded}>
                    {chartExpanded ? (
                      selected.coingeckoId ? (
                        <AssetChart
                          coingeckoId={selected.coingeckoId}
                          up={selected.change24h >= 0}
                          height={200}
                          allowCandles={false}
                        />
                      ) : (
                        <p className="px-1 py-6 text-center text-[13px] font-normal text-white/45">
                          {t("noChart", { symbol: selected.symbol })}
                        </p>
                      )
                    ) : null}
                  </div>

                  <div className="flex flex-col gap-[13.5px]">
                    <SpotAmountCard
                      amount={amount}
                      onAmountChange={setAmount}
                      balance={payBalance}
                      payDecimals={PAY_DECIMALS}
                      paySymbol={PAY_SYMBOL}
                      disabled={buy.pending}
                    />
                    <SpotQuickAmounts
                      values={SPOT_QUICK_AMOUNTS}
                      onSelect={setAmount}
                      selected={amount}
                      disabled={buy.pending}
                    />
                  </div>

                  <div className="mt-auto flex flex-col gap-6 pt-6">
                    <SpotOrderSummary
                      purchaseValue={usdcLabel(amountUnits)}
                      fee={usdcLabel(feeUnits)}
                      symbol={PAY_SYMBOL}
                    />
                    <SpotTradeActions
                      amount={amount}
                      pay={{
                        balance: payBalance,
                        decimals: PAY_DECIMALS,
                        symbol: PAY_SYMBOL,
                      }}
                      // Buy spends USDC, Sell draws down the selected asset, so
                      // each side is gated against its own balance. With no
                      // holding there is no token record and so no decimals to
                      // read, which is why that case carries the symbol alone.
                      sell={
                        held
                          ? {
                              balance: BigInt(held.rawBalance),
                              decimals: held.decimals,
                              symbol: held.symbol,
                            }
                          : { balance: null, symbol: selected.symbol }
                      }
                      onBuy={() => void buy.submit()}
                      onSell={requestSell}
                      pending={buy.pending ? "buy" : null}
                    />
                  </div>
                </>
              ) : (
                <AsyncEmpty>{t("noSelection")}</AsyncEmpty>
              )}
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}

// One placeholder shape. The same fill the ticket skeleton uses, so the two
// columns read as one loading state rather than two.
const SKELETON_FILL = "animate-pulse rounded bg-white/6";

// The desk's shape while the market catalogue is still in flight, drawn at the
// size the real thing will be so the page does not jump when the markets land.
//
// The left panel is built from the asset table's own box model rather than from
// a guessed row height: the same column track, the same paddings, the same
// rules, and a 33px chip in the asset cell. That chip is what sets a row's
// height (at the row's leading its two text lines come to 29.4px, so the chip
// wins), which is why copying it, and not a pixel figure, keeps the two in step
// when the table's type changes again.
//
// The chart is not drawn here: it starts collapsed, so the real desk has none
// on arrival either.
//
// The row count is the same fitted count the real table pages at, and the same
// ref reads it: only one of the two panels is ever mounted, so one measurement
// serves both and the list does not change length when the markets land.
function DeskSkeleton({
  label,
  rows,
  rowsRef,
}: {
  label: string;
  rows: number;
  rowsRef: (node: HTMLDivElement | null) => void;
}) {
  return (
    <div role="status" aria-live="polite" className={DESK_GRID}>
      <span className="sr-only">{label}</span>
      <div className="border-hairline bg-surface rounded-card flex flex-col self-stretch overflow-hidden border">
        {/* The list region grows and the pager sits under it, which is how the
            real table distributes the panel's spare height. Copied rather than
            approximated with an `mt-auto` pager: the two land the pager in the
            same place today, but only the same structure keeps them together
            when the table's box changes again. The `min-h-0` chain down to the
            rows block is copied for the same reason, and here it also has to be:
            it is what keeps the measured box sized by the panel. */}
        <div className="flex min-h-0 grow flex-col">
          {/* The column labels. The font size and leading are set here so the
              `1lh` bars below stand exactly as tall as the real labels do. */}
          <div
            className={`${SPOT_ASSET_COLUMNS} border-rule shrink-0 border-b py-3.5 text-[10.5px] leading-[1.13]`}
          >
            <span className={`${SKELETON_FILL} h-[1lh] w-[42px]`} />
            <span className={`${SKELETON_FILL} h-[1lh] w-[34px] justify-self-end`} />
            <span className={`${SKELETON_FILL} h-[1lh] w-[28px] justify-self-end`} />
            <span className={`${SKELETON_FILL} h-[1lh] w-[38px] justify-self-end`} />
          </div>

          <div ref={rowsRef} className="flex min-h-0 grow flex-col overflow-hidden">
            {Array.from({ length: rows }, (_, i) => (
              <div
                key={i}
                data-skeleton-row
                className={`${SPOT_ASSET_COLUMNS} border-rule border-b py-3 last:border-b-0`}
              >
                <div className="flex items-center gap-3">
                  <span className={`${SKELETON_FILL} size-[33px] shrink-0 rounded-[11px]`} />
                  <span className={`${SKELETON_FILL} h-[11px] w-[84px]`} />
                </div>
                <span className={`${SKELETON_FILL} h-[11px] w-[62px] justify-self-end`} />
                <span className={`${SKELETON_FILL} h-[11px] w-[48px] justify-self-end`} />
                <span className={`${SKELETON_FILL} h-[11px] w-[56px] justify-self-end`} />
              </div>
            ))}
          </div>
        </div>

        {/* The pager at the foot of the panel: prev, the page count, next. Built
            from ListPagination's own box rather than from a pixel figure, the
            same way the rows above are built from the table's row: its padding,
            its type, and pills carrying the button's border and padding around a
            `1lh` bar. That keeps the two in step if the pager's type changes.

            The height is reserved even though ListPagination hides itself on a
            single page, because at this point the catalogue has not arrived and
            the count is unknowable. A spot universe of ten or more markets, which
            is every real one, pages and the panels match exactly. A universe of
            nine or fewer would leave this skeleton one pager taller than the
            table that replaces it, and that is the case to be wrong in: the
            common case settles with no movement at all. */}
        <div className="flex items-center justify-between border-t border-white/6 px-4 py-3 font-sans text-[12.5px] font-medium sm:px-6">
          <span
            className={`${SKELETON_FILL} inline-flex items-center rounded-full border border-transparent px-3.5 py-2`}
          >
            <span className="h-[1lh] w-[52px]" />
          </span>
          <span className={`${SKELETON_FILL} h-[1lh] w-[74px]`} />
          <span
            className={`${SKELETON_FILL} inline-flex items-center rounded-full border border-transparent px-3.5 py-2`}
          >
            <span className="h-[1lh] w-[52px]" />
          </span>
        </div>
      </div>
      <div className={`${TICKET_PANEL} gap-4`}>
        <div className="h-[40px] animate-pulse rounded-2xl bg-white/6" />
        <div className="rounded-card h-[104px] animate-pulse bg-white/6" />
        <div className="rounded-card h-[92px] animate-pulse bg-white/6" />
        <div className="rounded-card mt-auto h-[76px] animate-pulse bg-white/6" />
        <div className="h-12 animate-pulse rounded-3xl bg-white/6" />
      </div>
    </div>
  );
}
