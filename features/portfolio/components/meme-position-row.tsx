"use client";

import { useId, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { AssetIcon } from "@/components/ui/asset-icon";
import { Disclosure } from "@/components/ui/disclosure";
import { Eyebrow } from "@/components/ui/eyebrow";
import { ChevronDownSoftIcon } from "@/components/ui/icons";
import { NetworkIcon } from "@/components/ui/network-icon";
import { SkeletonLine } from "@/components/ui/skeleton-line";
import { MemeActivityRow } from "@/features/portfolio/components/meme-activity-row";
import { useMemePosition } from "@/features/portfolio/hooks/use-meme-portfolio";
import {
  memeLogoUrl,
  positionToMemeToken,
  toneClass,
} from "@/features/portfolio/lib/meme-positions";
import { networkOf } from "@/lib/meme/chain";
import { formatPercentPoints, formatQuantity, formatUsdString } from "@/lib/meme/decimal";
import { marketDataAge, type MarketDataAge } from "@/lib/meme/format";
import type { MemeToken, PortfolioPosition } from "@/lib/meme/types";
import { tokenBg } from "@/lib/trade/assets";

type Translate = ReturnType<typeof useTranslations<"memePositions">>;

function ageText(t: Translate, minutes: number): string {
  if (minutes < 1) return t("ageJustNow");
  if (minutes < 60) return t("ageMinutes", { minutes });
  if (minutes < 24 * 60) return t("ageHours", { hours: Math.floor(minutes / 60) });
  return t("ageDays", { days: Math.floor(minutes / (24 * 60)) });
}

function marketDataText(t: Translate, age: MarketDataAge): string {
  if (age.kind === "none") return t("marketDataNone");
  const text = ageText(t, age.minutes);
  return age.kind === "stale"
    ? t("marketDataStale", { age: text })
    : t("marketDataFresh", { age: text });
}

function Badge({ children, title }: { children: string; title?: string }) {
  return (
    <span
      title={title}
      className="inline-flex items-center rounded-full border border-amber-200/25 bg-amber-200/10 px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap text-amber-200/80"
    >
      {children}
    </span>
  );
}

// A label and its value, as the asset sheet lists a holding's stats.
function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="shrink-0">{label}</span>
      <span className="min-w-0 text-right text-white">{children}</span>
    </div>
  );
}

// One position's confirmed trades, read once the row is opened.
function PositionTrades({ position }: { position: PortfolioPosition }) {
  const t = useTranslations("memePositions");
  const detail = useMemePosition(position.chain, position.address);
  if (detail.isLoading) {
    return (
      <div aria-busy="true" className="py-3">
        <SkeletonLine width="w-40" />
      </div>
    );
  }
  if (detail.error && !detail.position) {
    return (
      <div className="flex items-center gap-3 py-3 text-[12.5px] font-normal text-white/55">
        <span>{t("tradesError")}</span>
        <button
          type="button"
          onClick={() => detail.refetch()}
          className="cursor-pointer text-white/80 underline-offset-2 hover:underline"
        >
          {t("retry")}
        </button>
      </div>
    );
  }
  const trades = detail.position?.activity ?? [];
  if (trades.length === 0) {
    return <p className="py-3 text-[12.5px] font-normal text-white/45">{t("tradesEmpty")}</p>;
  }
  return (
    <ul className="mt-1 [&>li:first-child]:border-t-0">
      {trades.map((trade) => (
        <MemeActivityRow key={trade.id} activity={trade} />
      ))}
    </ul>
  );
}

interface MemePositionRowProps {
  position: PortfolioPosition;
  now: number;
  onSell: (token: MemeToken) => void;
}

/**
 * One service position, per the trade contract's rendering rules: a null mark
 * is "Valuation unavailable" (never $0, never -100%), a ledger-derived
 * quantity says so, a partial cost basis says why, the mark's age is shown and
 * labelled stale, P&L is coloured by sign with an explicit +. The market value
 * is labelled as a mark, not what a sale would pay: Sell opens the trade sheet,
 * which previews the proceeds before anything is confirmed.
 *
 * Drawn as the Coins view draws a holding: logo, symbol and amount on the left,
 * value and P&L on the right. Tapping it opens the position in place, in the
 * asset sheet's own shape: its stats, its trades, and a full-width Sell.
 */
export function MemePositionRow({ position, now, onSell }: MemePositionRowProps) {
  const t = useTranslations("memePositions");
  const [expanded, setExpanded] = useState(false);
  const detailId = useId();
  const symbol = position.symbol ?? position.name ?? position.address.slice(0, 6);
  const unpriced = position.currentPriceUsd === null;
  const value = unpriced ? null : formatUsdString(position.currentValueUsd);
  const totalReturn = formatPercentPoints(position.totalReturnPercent);
  const quantity = formatQuantity(position.quantityRemaining) ?? position.quantityRemaining;
  const open = position.positionStatus === "OPEN";
  const chainLabel = position.chain === "solana" ? t("tabSolana") : t("tabBase");
  const age = marketDataAge(position.marketDataUpdatedAt, now);
  const ledgerDerived = position.balanceStatus === "UNAVAILABLE";
  const partialCostBasis = position.costBasisStatus === "PARTIAL";
  // Something in the details wants reading before the figures are trusted.
  const needsAttention = ledgerDerived || partialCostBasis || age.kind !== "fresh";

  return (
    <li aria-label={symbol} className="border-t border-white/6">
      {/* data-no-ripple for the same reason as a Coins row: a list row must
          not grow under the pointer, so it keeps the colour hover only. */}
      <button
        type="button"
        data-no-ripple
        aria-expanded={expanded}
        aria-controls={detailId}
        onClick={() => setExpanded((shown) => !shown)}
        className="flex w-full cursor-pointer items-center gap-3 py-3.5 text-left transition-colors duration-150 hover:bg-white/6"
      >
        <span className="relative shrink-0">
          <AssetIcon
            sym={symbol}
            bg={tokenBg(symbol)}
            logo={memeLogoUrl(position.chain, position.address, position.logoUrl)}
            fallback="gradient"
          />
          <span className="absolute -right-1 -bottom-1 grid place-items-center rounded-full bg-[#0d0d0f] p-[1.5px]">
            <NetworkIcon network={networkOf(position.chainId) ?? "base-mainnet"} size={14} />
          </span>
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate font-sans text-[14.5px] font-medium">{symbol}</span>
            {needsAttention ? (
              <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-amber-200/80" />
            ) : null}
          </span>
          <span className="mt-0.5 block truncate text-[12px] font-normal text-white/50">
            {quantity} · {chainLabel}
          </span>
        </span>

        <span className="flex shrink-0 flex-col items-end text-right">
          {value === null ? (
            <span className="font-sans text-[13px] font-normal text-white/60">
              {t("valuationUnavailable")}
            </span>
          ) : (
            <span className="tnum font-sans text-[14.5px] font-medium">{value}</span>
          )}
          <span className="mt-0.5 flex items-center gap-1.5 text-[12px] font-normal">
            <span className={`tnum ${toneClass(position.totalPnlUsd)}`}>
              {formatUsdString(position.totalPnlUsd, { signed: true }) ?? "—"}
            </span>
            {totalReturn ? (
              <span className={`tnum ${toneClass(position.totalReturnPercent)}`}>
                {totalReturn}
              </span>
            ) : null}
          </span>
        </span>

        <ChevronDownSoftIcon
          size={12}
          className={`shrink-0 text-white/35 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
        />
      </button>

      <Disclosure open={expanded} id={detailId}>
        {(rendered) =>
          rendered ? (
            <div className="pb-4">
              <div className="flex flex-col gap-[11px] rounded-[14px] border border-white/8 bg-white/3 px-4 py-3.5 text-[13px] font-normal text-white/60">
                <Stat label={t("colHolding")}>
                  <span className="flex flex-wrap items-center justify-end gap-1.5">
                    {ledgerDerived ? (
                      <Badge title={t("ledgerDerivedHint")}>{t("ledgerDerived")}</Badge>
                    ) : null}
                    <span className="tnum">
                      {quantity} {symbol}
                    </span>
                  </span>
                </Stat>
                <Stat label={t("colEntry")}>
                  <span className="tnum">
                    {formatUsdString(position.averageEntryPriceUsd) ?? "—"}
                  </span>
                </Stat>
                {/* The mark's age names the price, so a stale one is read before the figure. */}
                <div className="flex items-start justify-between gap-4">
                  <span className={age.kind === "fresh" ? "" : "text-amber-200/80"}>
                    {marketDataText(t, age)}
                  </span>
                  <span className="tnum text-right text-white">
                    {formatUsdString(position.currentPriceUsd) ?? "—"}
                  </span>
                </div>
                <Stat label={t("summaryRealized")}>
                  <span className="flex flex-col items-end">
                    <span className={`tnum ${toneClass(position.realizedPnlUsd)}`}>
                      {formatUsdString(position.realizedPnlUsd, { signed: true }) ?? "—"}
                    </span>
                    {unpriced ? (
                      <span className="text-[11.5px] text-white/40">{t("realizedOnly")}</span>
                    ) : null}
                  </span>
                </Stat>
              </div>

              {partialCostBasis ? (
                <div className="mt-2.5 rounded-[14px] border border-amber-200/15 bg-amber-200/5 px-4 py-3">
                  <Badge>{t("costBasisPartial")}</Badge>
                  <p className="mt-2 text-[12px] leading-[1.5] font-normal text-white/55">
                    {t("costBasisPartialHint")}
                  </p>
                </div>
              ) : null}

              <div className="mt-4">
                <Eyebrow>{t("trades")}</Eyebrow>
                <PositionTrades position={position} />
              </div>

              {open ? (
                <div className="mt-3">
                  <button
                    type="button"
                    disabled={!position.sellEnabled}
                    onClick={() => onSell(positionToMemeToken(position))}
                    className="ws-chrome text-ink w-full cursor-pointer rounded-[14px] bg-white p-3.5 font-sans text-[15px] font-semibold hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {t("sellAria", { symbol })}
                  </button>
                  {position.sellEnabled ? null : (
                    <p className="mt-2 text-center text-[12px] font-normal text-white/45">
                      {t("sellPaused")}
                    </p>
                  )}
                </div>
              ) : null}
            </div>
          ) : null
        }
      </Disclosure>
    </li>
  );
}
