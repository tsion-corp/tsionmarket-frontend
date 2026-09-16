"use client";

import { useTranslations } from "next-intl";

import type { ChangeDirection } from "@/components/ui/asset-table-row";
import {
  ChartDisclosure,
  PairHeader,
  PairSelector,
  TokenBadge,
  type ChartDisclosureProps,
  type PairHeaderProps,
  type PairSelectorProps,
  type TokenBadgeProps,
} from "@/components/ui/trade-pair-header";

// The spot desk's binding to the shared ticket header. The pill, the change
// line and the chart disclosure live in components/ui; what is spot is the
// namespace their wording comes from.
//
// The change direction is no longer declared here. It was declared twice, once
// here and once on the asset row, with two different flat tones. The surviving
// one is the asset table's, which is what the desk already renders.

export type SpotChangeDirection = ChangeDirection;

export type SpotTokenBadgeProps = TokenBadgeProps;

// The label props are supplied by these wrappers, so the spot-facing contracts
// are the shared ones minus the wording.
export type SpotPairSelectorProps = Omit<PairSelectorProps, "label">;

export type SpotChartDisclosureProps = Omit<ChartDisclosureProps, "label">;

export type SpotPairHeaderProps = Omit<PairHeaderProps, "labels" | "changeDirection"> & {
  changeDirection: SpotChangeDirection;
};

export function SpotTokenBadge({ symbol, className }: SpotTokenBadgeProps) {
  return <TokenBadge symbol={symbol} className={className} />;
}

export function SpotPairSelector({ pair, onSelectPair, menuOpen = false }: SpotPairSelectorProps) {
  const t = useTranslations("spot");
  return (
    <PairSelector
      pair={pair}
      onSelectPair={onSelectPair}
      menuOpen={menuOpen}
      label={t("selectMarket")}
    />
  );
}

export function SpotChartDisclosure({ expanded, onToggle, panelId }: SpotChartDisclosureProps) {
  const t = useTranslations("spot");
  return (
    <ChartDisclosure
      expanded={expanded}
      onToggle={onToggle}
      panelId={panelId}
      label={t("viewChart")}
    />
  );
}

export function SpotPairHeader({
  symbol,
  change24h,
  changeDirection,
  chartExpanded,
  onToggleChart,
  chartPanelId,
  className,
}: SpotPairHeaderProps) {
  const t = useTranslations("spot");
  return (
    <PairHeader
      symbol={symbol}
      change24h={change24h}
      changeDirection={changeDirection}
      chartExpanded={chartExpanded}
      onToggleChart={onToggleChart}
      chartPanelId={chartPanelId}
      className={className}
      labels={{ change24h: t("change24h"), viewChart: t("viewChart") }}
    />
  );
}
