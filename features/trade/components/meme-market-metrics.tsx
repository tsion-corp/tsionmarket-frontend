"use client";

import { useId } from "react";
import { useTranslations } from "next-intl";
import { Disclosure } from "@/components/ui/disclosure";
import { ArrowDownIcon, ChartBarsIcon } from "@/components/ui/icons";

// The market-metrics disclosure on the memecoin desk (Figma 173:45712, the
// expanded state of the meme main screen 173:45311).
//
// Presentational only. It fetches nothing and knows no query, so opening it
// cannot add a poll. Every figure arrives already formatted: this layer never
// turns a market cap, a volume or a liquidity figure back into a number, which
// is the app's rule for anything denominated in money. The caller applies
// compactUsd (lib/meme/api.ts) and passes the resulting string, or null.
//
// null means the service published no figure, and that is rendered as an
// explicit "Unavailable", never as a zero: a $0 market cap reads as a real,
// worthless coin.
//
// One file, two decks. The phone board (meme-board) and the desktop meme desk
// (the /meme route) both mount this, so the phone comp's measurements are the
// base styles and every one of them carries the `md:` class that hands the
// desk back exactly what it had. The phone numbers come from the 402-wide comp
// states 122:7205 "Close Market Metrics" and 122:7351 "Sell Metrics", which
// draw the metrics block identically: metric tile 70px, traders card 110.5px,
// trigger row 16px. The `md:leading-[1.5]` pairs restore the 1.5 line height
// this app inherits, which is what made the desk's boxes taller than the comp.

// The design set the whole metrics block in Inter; production keeps its body
// face, Geist. The disclosure label above is Mona Sans.
const INTER = "font-sans";

export type MemeMetricDirection = "up" | "down";

export interface MemeMetricChange {
  /** Already formatted, e.g. "-3.10%". */
  display: string;
  /** Decided by the caller, so this layer never parses the string back. */
  direction: MemeMetricDirection;
}

export interface MemeMetricValue {
  /** Already formatted, e.g. "$84.2M". null when the service publishes none. */
  display: string | null;
  /** The 24h move on this figure, where the caller has one to show. */
  change?: MemeMetricChange | null;
}

export interface MemeTraderSplit {
  /** Already formatted counts, e.g. "1,245". */
  buyers: string;
  sellers: string;
  /** The buyers' share of the split, 0 to 100. Sizes the bar and the legend. */
  buyerSharePercent: number;
}

export interface MemeMarketMetricsData {
  marketCap: MemeMetricValue;
  volume24h: MemeMetricValue;
  liquidity: MemeMetricValue;
  /** Whole days since the pair listed. null when the service publishes none. */
  ageDays: number | null;
  /** null when the service publishes no buy/sell split. */
  traders: MemeTraderSplit | null;
}

export type MemeMarketMetricsStatus = "loading" | "error" | "ready";

export interface MemeMarketMetricsProps {
  /** Owned by the parent: the board decides which of its panels is open. */
  expanded: boolean;
  onToggle: (next: boolean) => void;
  status?: MemeMarketMetricsStatus;
  /** null with status "ready" means the coin has no metrics to show. */
  metrics: MemeMarketMetricsData | null;
  onRetry?: () => void;
  className?: string;
  /**
   * Whether to draw the disclosure trigger. The desktop board already carries a
   * "View Market Metrics" row in its own rail, so rendering ours there would
   * show two identical triggers for one disclosure. A parent that supplies its
   * own passes false, and passes `panelId` so its trigger's aria-controls
   * resolves to the panel this component owns.
   */
  showTrigger?: boolean;
  panelId?: string;
}

function isBlank(value: string | null | undefined): boolean {
  return value === null || value === undefined || value.trim() === "";
}

function clampShare(percent: number): number {
  if (!Number.isFinite(percent)) return 0;
  return Math.min(100, Math.max(0, percent));
}

function Unavailable({ label }: { label: string }) {
  return <span className={`${INTER} text-[13px] font-medium text-white/35`}>{label}</span>;
}

interface StatItemProps {
  label: string;
  /** Already formatted. null or blank renders the unavailable treatment. */
  value: string | null;
  change?: MemeMetricChange | null;
  unavailableLabel: string;
}

function StatItem({ label, value, change, unavailableLabel }: StatItemProps) {
  const missing = isBlank(value);
  return (
    <div
      data-metric={label}
      data-unavailable={missing ? "true" : "false"}
      className="border-rule bg-grey-800 flex min-h-[70px] flex-1 flex-col justify-center gap-1 rounded-xl border p-[12.5px] md:min-h-[73px] md:p-[13px]"
    >
      <span
        data-testid="meme-metric-label"
        className={`${INTER} text-[11.5px] leading-[14px] font-medium text-white/30 md:text-[12px] md:leading-[1.5]`}
      >
        {label}
      </span>
      {missing ? (
        <Unavailable label={unavailableLabel} />
      ) : (
        <span
          className={`${INTER} tnum text-[14.6px] leading-[18px] font-bold text-white md:text-[15px] md:leading-[1.5]`}
        >
          {value}
        </span>
      )}
      {change ? (
        <span
          className={`${INTER} tnum text-[11px] font-semibold ${
            change.direction === "down" ? "text-down" : "text-up"
          }`}
        >
          {change.display}
        </span>
      ) : null}
    </div>
  );
}

interface TradersCardProps {
  traders: MemeTraderSplit | null;
  unavailableLabel: string;
  headingLabel: string;
  buyersLabel: string;
  sellersLabel: string;
}

function TradersCard({
  traders,
  unavailableLabel,
  headingLabel,
  buyersLabel,
  sellersLabel,
}: TradersCardProps) {
  const share = traders ? clampShare(traders.buyerSharePercent) : 0;
  return (
    <div
      data-testid="meme-traders-card"
      data-unavailable={traders ? "false" : "true"}
      className="border-rule bg-grey-800 md:rounded-card flex flex-col gap-[11px] rounded-[19px] border p-[15px]"
    >
      <div className="flex items-center justify-between">
        <span
          className={`${INTER} text-[12px] font-bold tracking-[0.02em] text-white/50 uppercase`}
        >
          {headingLabel}
        </span>
        {/* The design draws a chevron here. No second disclosure is specified
            for this card, so it stays a glyph rather than a dead control. */}
        <span aria-hidden className="flex items-center text-white/40">
          <ArrowDownIcon size={19} className="md:size-[17px]" />
        </span>
      </div>

      {traders ? (
        <>
          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-[2px]">
              <span
                className={`${INTER} text-[10.4px] leading-[13px] font-normal text-white/30 md:text-[11px] md:leading-[1.5]`}
              >
                {buyersLabel}
              </span>
              <span
                className={`${INTER} tnum text-buy text-[13px] leading-[16px] font-bold md:leading-[1.5]`}
              >
                {traders.buyers}
              </span>
            </div>
            <span
              className={`${INTER} tnum text-[11.4px] leading-[14px] font-semibold text-white/50 md:text-[12px] md:leading-[1.5]`}
            >
              {`${share.toFixed(1)}% / ${(100 - share).toFixed(1)}%`}
            </span>
            <div className="flex flex-col items-end gap-[2px]">
              <span
                className={`${INTER} text-[10.4px] leading-[13px] font-normal text-white/30 md:text-[11px] md:leading-[1.5]`}
              >
                {sellersLabel}
              </span>
              <span
                className={`${INTER} tnum text-sell text-[13px] leading-[16px] font-bold md:leading-[1.5]`}
              >
                {traders.sellers}
              </span>
            </div>
          </div>
          <div className="flex h-[7.5px] overflow-hidden rounded-full">
            <div
              data-testid="meme-trader-buy-share"
              className="bg-buy h-full"
              style={{ width: `${share}%` }}
            />
            <div className="bg-sell h-full flex-1" />
          </div>
        </>
      ) : (
        <Unavailable label={unavailableLabel} />
      )}
    </div>
  );
}

export function MemeMarketMetrics({
  expanded,
  onToggle,
  status = "ready",
  metrics,
  onRetry,
  className = "",
  showTrigger = true,
  panelId: panelIdProp,
}: MemeMarketMetricsProps) {
  const t = useTranslations("meme");
  const generatedId = `meme-market-metrics-${useId()}`;
  const panelId = panelIdProp ?? generatedId;
  const unavailableLabel = t("metricUnavailable");

  // The gap between the trigger row and the panel, on the panel's content
  // rather than on the section as a flex gap. The panel stays mounted while
  // closed so the collapse can animate (see Disclosure), and a flex gap would
  // outlive that collapse: a closed trigger would sit above a band of empty
  // space the design never draws. It cannot go on the Disclosure's own
  // className either, because that lands on the grid item, whose padding
  // counts towards the 0fr track. On the content it is clipped away.
  //
  // 12px is the comp's gap under this component's own trigger. With the trigger
  // suppressed the row above is the caller's, and on the desk that is the rail,
  // which stacks on 13px: same phone-base plus `md:` pairing as every other
  // measurement in this file, and the desk is the only place md is reached.
  const panelLead = showTrigger ? "pt-3" : "pt-3 md:pt-[13px]";

  return (
    <section className={`flex flex-col ${className}`}>
      {showTrigger ? (
        <button
          type="button"
          onClick={() => onToggle(!expanded)}
          aria-expanded={expanded}
          aria-controls={panelId}
          // The comp's row is 16px tall, so the 44px touch target is an
          // overlay rather than padding: padding would push the panel down.
          className="relative flex w-fit items-center gap-2 text-white after:absolute after:top-1/2 after:left-0 after:h-11 after:w-full after:min-w-11 after:-translate-y-1/2 after:content-['']"
        >
          {/* The comp groups the dot, the mark and the label on a 4px rhythm
              and holds the chevron 8px off the end of that group. */}
          <span className="flex items-center gap-1 md:gap-2">
            <span aria-hidden className="bg-kash size-[3px] shrink-0 rounded-full" />
            <ChartBarsIcon size={13} className="text-kash shrink-0 md:size-[14px]" />
            <span className="font-serif text-[12px] leading-[15px] font-semibold tracking-[-0.02em] md:text-[12.6px] md:leading-[1.5]">
              {expanded ? t("metricsHide") : t("metricsShow")}
            </span>
          </span>
          <ArrowDownIcon
            size={16}
            className={`shrink-0 md:size-[17px] ${expanded ? "rotate-180" : ""}`}
          />
        </button>
      ) : null}

      <Disclosure open={expanded} id={panelId}>
        <div
          // A named group, not a landmark: the trade panel already carries
          // enough regions without each disclosure adding one. It sits inside
          // the panel rather than on it because the panel element is the
          // animated box, and Disclosure owns that markup.
          role="group"
          aria-label={t("metricsRegion")}
          className={`flex flex-col gap-3 ${panelLead}`}
        >
          {status === "loading" ? (
            <div role="status" aria-live="polite" className="flex flex-col gap-3">
              <span className="sr-only">{t("metricsLoading")}</span>
              <div className="flex gap-3">
                <div className="bg-grey-800 h-[70px] flex-1 animate-pulse rounded-xl md:h-[73px]" />
                <div className="bg-grey-800 h-[70px] flex-1 animate-pulse rounded-xl md:h-[73px]" />
              </div>
              <div className="flex gap-3">
                <div className="bg-grey-800 h-[70px] flex-1 animate-pulse rounded-xl md:h-[73px]" />
                <div className="bg-grey-800 h-[70px] flex-1 animate-pulse rounded-xl md:h-[73px]" />
              </div>
              <div className="bg-grey-800 rounded-card h-[110px] animate-pulse" />
            </div>
          ) : status === "error" ? (
            <div
              role="alert"
              className="border-rule bg-grey-800 rounded-card flex flex-col items-start gap-2 border p-[15px]"
            >
              <span className={`${INTER} text-[13px] font-medium text-white/70`}>
                {t("metricsError")}
              </span>
              {onRetry ? (
                <button
                  type="button"
                  onClick={onRetry}
                  className="border-hairline bg-surface min-h-11 min-w-11 rounded-full border px-3 py-1.5 text-[12px] font-semibold text-white md:min-h-[auto] md:min-w-[auto]"
                >
                  {t("metricsRetry")}
                </button>
              ) : null}
            </div>
          ) : metrics === null ? (
            <div className="border-rule bg-grey-800 rounded-card border p-[15px]">
              <span className={`${INTER} text-[13px] font-medium text-white/45`}>
                {t("metricsEmpty")}
              </span>
            </div>
          ) : (
            <>
              <div className="flex gap-3">
                <StatItem
                  label={t("metricMarketCap")}
                  value={metrics.marketCap.display}
                  change={metrics.marketCap.change}
                  unavailableLabel={unavailableLabel}
                />
                <StatItem
                  label={t("metricVolume24h")}
                  value={metrics.volume24h.display}
                  change={metrics.volume24h.change}
                  unavailableLabel={unavailableLabel}
                />
              </div>
              <div className="flex gap-3">
                <StatItem
                  label={t("metricLiquidity")}
                  value={metrics.liquidity.display}
                  change={metrics.liquidity.change}
                  unavailableLabel={unavailableLabel}
                />
                <StatItem
                  label={t("metricAge")}
                  // Days are a count, not money, so the plural message does the
                  // formatting. null stays null so the item reads Unavailable
                  // rather than "0 days".
                  value={
                    metrics.ageDays === null ? null : t("metricAgeDays", { days: metrics.ageDays })
                  }
                  unavailableLabel={unavailableLabel}
                />
              </div>
              <TradersCard
                traders={metrics.traders}
                unavailableLabel={unavailableLabel}
                headingLabel={t("metricActiveTraders")}
                buyersLabel={t("metricBuyers")}
                sellersLabel={t("metricSellers")}
              />
            </>
          )}
        </div>
      </Disclosure>
    </section>
  );
}
