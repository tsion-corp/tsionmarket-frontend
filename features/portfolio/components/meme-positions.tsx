"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { SkeletonLine } from "@/components/ui/skeleton-line";
import { MemeActivityRow } from "@/features/portfolio/components/meme-activity-row";
import { MemePositionRow } from "@/features/portfolio/components/meme-position-row";
import {
  useMemeActivity,
  useMemePortfolio,
  useMemePortfolioSummary,
  type PagedList,
} from "@/features/portfolio/hooks/use-meme-portfolio";
import { positionsForTab, toneClass } from "@/features/portfolio/lib/meme-positions";
import { formatPercentPoints, formatUsdString } from "@/lib/meme/decimal";
import type { MemeToken, PortfolioChain, PortfolioPosition } from "@/lib/meme/types";

type Tab = "open" | "closed" | "activity" | "base" | "solana";
const TABS: readonly Tab[] = ["open", "closed", "activity", "base", "solana"];
const TAB_LABEL = {
  open: "tabOpen",
  closed: "tabClosed",
  activity: "tabActivity",
  base: "tabBase",
  solana: "tabSolana",
} as const;

// How often the market-data ages re-read the clock, so "14 min ago" turns
// "stale" on its own while the section sits open.
const CLOCK_TICK_MS = 30_000;

// Placeholder rows while a list loads, drawn as the Coins view draws its own.
const SKELETON_ROWS = [0, 1, 2];

function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function PartialBadge() {
  const t = useTranslations("memePositions");
  return (
    <span className="inline-flex items-center rounded-full border border-amber-200/25 bg-amber-200/10 px-2.5 py-1 text-[11.5px] font-semibold text-amber-200/80">
      {t("partialBadge")}
    </span>
  );
}

// The Coins view's error state, so a failed list reads the same in both views.
function ErrorLine({ message, onRetry }: { message: string; onRetry: () => unknown }) {
  const t = useTranslations("memePositions");
  return (
    <div className="flex flex-col items-center gap-3 px-2 py-8 text-center">
      <p className="max-w-[300px] text-[13px] leading-[1.5] font-normal text-white/55">{message}</p>
      <button
        type="button"
        onClick={() => onRetry()}
        className="text-ink cursor-pointer rounded-xl bg-white px-5 py-2.5 font-sans text-[13px] font-semibold hover:opacity-90"
      >
        {t("retry")}
      </button>
    </div>
  );
}

// The empty card the Kash history sheet uses.
function EmptyCard({ text }: { text: string }) {
  return (
    <div className="mt-2 rounded-[14px] border border-white/8 bg-white/3 px-4 py-6 text-center text-[13px] font-normal text-white/55">
      {text}
    </div>
  );
}

function SkeletonRows() {
  return (
    <div aria-busy="true">
      {SKELETON_ROWS.map((i) => (
        <div
          key={i}
          aria-hidden="true"
          className="flex items-center gap-3 border-t border-white/6 py-3.5"
        >
          <span className="size-9 shrink-0 animate-pulse rounded-[11px] bg-white/8" />
          <span className="min-w-0 flex-1">
            <span className="block font-sans text-[14.5px] font-medium">
              <SkeletonLine width="w-14" />
            </span>
            <span className="mt-0.5 block text-[12px] font-normal">
              <SkeletonLine width="w-28" />
            </span>
          </span>
          <span className="shrink-0 text-right font-sans text-[14.5px] font-medium">
            <SkeletonLine width="w-16" />
          </span>
        </div>
      ))}
    </div>
  );
}

// The server's paging, kept: how many of the total are in hand, and "Load
// more" until page * limit covers it.
function Paging<T>({ list }: { list: PagedList<T> }) {
  const t = useTranslations("memePositions");
  if (list.total === null || list.total === 0) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/6 py-3">
      <span className="text-[12.5px] font-normal text-white/55">
        {list.loadMoreFailed
          ? t("loadMoreFailed")
          : t("shownOf", { shown: list.items.length, total: list.total })}
      </span>
      {list.hasMore ? (
        <button
          type="button"
          onClick={list.loadMore}
          disabled={list.isLoadingMore}
          className="text-ink cursor-pointer rounded-lg bg-white px-3 py-1.5 text-[12.5px] font-semibold hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
        >
          {list.isLoadingMore ? t("loadingMore") : t("loadMore")}
        </button>
      ) : null}
    </div>
  );
}

// What the memecoins are worth and what they made, in the bordered card the
// app's sheets use, with the figure set in the display face as the asset sheet
// sets a price.
function SummaryCard() {
  const t = useTranslations("memePositions");
  const locale = useLocale();
  const { summary, isLoading, error, refetch } = useMemePortfolioSummary();

  if (isLoading) {
    return (
      <div
        aria-busy="true"
        className="flex items-end justify-between gap-4 rounded-[14px] border border-white/8 bg-white/3 px-4 py-3.5"
      >
        <span className="flex flex-col gap-2">
          <SkeletonLine width="w-20" />
          <span className="block h-6 w-28 animate-pulse rounded-md bg-white/8" />
        </span>
        <SkeletonLine width="w-16" />
      </div>
    );
  }
  if (!summary) {
    return error ? <ErrorLine message={t("summaryError")} onRetry={refetch} /> : null;
  }

  const partial = !summary.marketValueComplete;
  const totalReturn = formatPercentPoints(summary.totalReturnPercent);
  const calculatedAt = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(summary.calculatedAt));

  return (
    <section
      aria-label={t("summaryLabel")}
      className="rounded-[14px] border border-white/8 bg-white/3 px-4 py-3.5"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[12px] font-normal text-white/50">{t("summaryValue")}</div>
          <div className="ws-display tnum mt-0.5 text-[22px] leading-[30px] tracking-[-0.01em]">
            {formatUsdString(summary.currentValueUsd) ?? "—"}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-[12px] font-normal text-white/50">{t("summaryTotalPnl")}</div>
          {/* As tall as the display figure beside it, so both figures sit on one line. */}
          <div className="mt-0.5 flex h-[30px] items-center justify-end gap-1.5">
            <span className={`tnum text-[14px] font-semibold ${toneClass(summary.totalPnlUsd)}`}>
              {formatUsdString(summary.totalPnlUsd, { signed: true }) ?? "—"}
            </span>
            {totalReturn ? (
              <span
                title={t("summaryReturn")}
                className={`tnum text-[12px] font-normal ${toneClass(summary.totalReturnPercent)}`}
              >
                {totalReturn}
              </span>
            ) : null}
          </div>
        </div>
      </div>
      {partial ? (
        <div className="mt-2.5">
          <PartialBadge />
        </div>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-white/6 pt-2.5 text-[12px] font-normal text-white/45">
        <span>
          {t("summaryRealized")}{" "}
          <span className={`tnum font-medium ${toneClass(summary.realizedPnlUsd)}`}>
            {formatUsdString(summary.realizedPnlUsd, { signed: true }) ?? "—"}
          </span>
        </span>
        <span className="text-white/35">{t("summaryAsOf", { time: calculatedAt })}</span>
      </div>
    </section>
  );
}

interface PositionsPanelProps {
  chain?: PortfolioChain;
  status: PortfolioPosition["positionStatus"] | null;
  emptyText: string;
  now: number;
  onSell: (token: MemeToken) => void;
}

// A positions tab. Mounted only while its tab is selected, so an unopened tab
// never asks the service for anything.
function PositionsPanel({ chain, status, emptyText, now, onSell }: PositionsPanelProps) {
  const t = useTranslations("memePositions");
  const list = useMemePortfolio(chain);
  const rows = positionsForTab(list.items, status);

  if (list.isLoading) return <SkeletonRows />;
  if (list.error && list.items.length === 0) {
    return <ErrorLine message={t("error")} onRetry={list.refetch} />;
  }

  // The service states its disclaimer per position; the same sentence is shown
  // once under the list rather than repeated on every row.
  const disclaimers = [...new Set(rows.map((p) => p.valuationDisclaimer).filter(Boolean))];

  return (
    <>
      {rows.length === 0 ? (
        <EmptyCard text={emptyText} />
      ) : (
        <ul>
          {rows.map((position) => (
            <MemePositionRow
              key={`${position.chainId}:${position.address}`}
              position={position}
              now={now}
              onSell={onSell}
            />
          ))}
        </ul>
      )}
      <Paging list={list} />
      {disclaimers.length > 0 ? (
        <div className="border-t border-white/6 pt-3">
          {disclaimers.map((line) => (
            <p key={line} className="text-[11.5px] font-normal text-white/35">
              {line}
            </p>
          ))}
        </div>
      ) : null}
    </>
  );
}

function ActivityPanel() {
  const t = useTranslations("memePositions");
  const list = useMemeActivity();

  if (list.isLoading) return <SkeletonRows />;
  if (list.error && list.items.length === 0) {
    return <ErrorLine message={t("activityError")} onRetry={list.refetch} />;
  }
  return (
    <>
      {list.items.length === 0 ? (
        <EmptyCard text={t("emptyActivity")} />
      ) : (
        <ul>
          {list.items.map((activity) => (
            <MemeActivityRow key={activity.id} activity={activity} />
          ))}
        </ul>
      )}
      <Paging list={list} />
    </>
  );
}

/**
 * The Memecoins view of the holdings sheet, behind the balance card's coins
 * button: what was bought through the trade service, with profit and loss from
 * the service's own ledger. A summary card, then Open · Closed · Activity ·
 * Base · Solana, each keeping the server's paging. Sell hands the position, on
 * its own chain, to whoever owns the trade sheet; this feature never imports it.
 */
export function MemePositions({ onSell }: { onSell: (token: MemeToken) => void }) {
  const t = useTranslations("memePositions");
  const [tab, setTab] = useState<Tab>("open");
  const now = useNow(CLOCK_TICK_MS);
  const { summary } = useMemePortfolioSummary();
  const nothingYet = summary !== null && summary.totalPositions === 0;

  return (
    // One scroller for the card, the tabs and the list, so the sheet's own
    // panel never scrolls and its close button stays put. Budgeted the way
    // the Coins list is (see holdings-modal.tsx), less the search field this
    // view has no use for: the title, the tabs and the panel's padding cost
    // about 150px. The tabs stick to the top once the card scrolls away.
    <div
      className="ws-no-scrollbar mt-3.5 max-h-[min(88vh_-_160px,720px)] overflow-y-auto"
      data-sensitive="balance"
    >
      <SummaryCard />

      <div
        role="tablist"
        aria-label={t("tabsLabel")}
        className="ws-no-scrollbar bg-sheet sticky top-0 z-[1] flex gap-1 overflow-x-auto pt-4 pb-2"
      >
        {TABS.map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`meme-tab-${id}`}
            aria-selected={tab === id}
            aria-controls="meme-tab-panel"
            onClick={() => setTab(id)}
            className={`shrink-0 cursor-pointer rounded-full px-3 py-1.5 text-[12.5px] font-medium transition-colors ${
              tab === id ? "bg-white/12 text-white/90" : "text-white/45 hover:text-white/70"
            }`}
          >
            {t(TAB_LABEL[id])}
          </button>
        ))}
      </div>

      <div role="tabpanel" id="meme-tab-panel" aria-labelledby={`meme-tab-${tab}`}>
        {tab === "activity" ? (
          <ActivityPanel />
        ) : (
          <PositionsPanel
            key={tab}
            chain={tab === "base" || tab === "solana" ? tab : undefined}
            status={tab === "open" ? "OPEN" : tab === "closed" ? "CLOSED" : null}
            emptyText={
              tab === "open"
                ? nothingYet
                  ? t("emptyAll")
                  : t("emptyOpen")
                : tab === "closed"
                  ? t("emptyClosed")
                  : t("emptyChain", { chain: t(TAB_LABEL[tab]) })
            }
            now={now}
            onSell={onSell}
          />
        )}
      </div>
    </div>
  );
}
