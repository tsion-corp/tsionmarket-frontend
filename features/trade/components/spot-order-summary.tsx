"use client";

import { useTranslations } from "next-intl";
import { SkeletonLine } from "@/components/ui/skeleton-line";

// What the order costs, shown above the Buy and Sell buttons: the value of the
// purchase and the fee on it.
//
// Both figures arrive display-ready. This component does no arithmetic and no
// parsing, so there is no place for a rounding error to enter; the quote that
// produced them owns the precision.

export interface SpotOrderSummaryProps {
  // Formatted for display, without the symbol: "5,000", "3.50".
  purchaseValue: string;
  fee: string;
  // The token both figures are quoted in, e.g. "USDC".
  symbol: string;
  // Set while a fresh quote is in flight. The rows hold their height and show
  // placeholders instead of a stale figure.
  loading?: boolean;
}

export function SpotOrderSummary({
  purchaseValue,
  fee,
  symbol,
  loading = false,
}: SpotOrderSummaryProps) {
  const t = useTranslations("spot");

  return (
    // The leading is set on the card so both rows inherit one line box. At the
    // Tailwind default of 1.5 each row is 21px and the card is 88px against the
    // design's 74px, the largest single inflation in the panel. 14px is the
    // design's line box for both the 13px label and the 14px value, and the
    // SkeletonLine that stands in for a value while a quote loads is sized in
    // em, so the loading rows keep the same height. Nothing here caps a height,
    // so a longer label in another locale still sets the row it sits in.
    <div className="rounded-card border-hairline-amber bg-panel flex w-full flex-col gap-2.5 border-2 p-4 leading-[14px] whitespace-nowrap">
      <SummaryRow
        label={t("purchaseValue")}
        value={purchaseValue}
        symbol={symbol}
        loading={loading}
        skeletonWidth="w-[5.5em]"
      />
      <SummaryRow
        label={t("fee")}
        value={fee}
        symbol={symbol}
        loading={loading}
        skeletonWidth="w-[4.5em]"
      />
    </div>
  );
}

function SummaryRow({
  label,
  value,
  symbol,
  loading,
  skeletonWidth,
}: {
  label: string;
  value: string;
  symbol: string;
  loading: boolean;
  skeletonWidth: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="ws-display text-[13px] font-semibold text-[rgba(148,163,184,0.6)]">
        {label}
      </span>
      <span className="ws-display text-[14px] font-semibold text-[#f8fafc]">
        {loading ? <SkeletonLine width={skeletonWidth} /> : `${value} ${symbol}`}
      </span>
    </div>
  );
}
