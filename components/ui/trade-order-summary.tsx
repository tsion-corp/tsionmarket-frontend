"use client";

import { SkeletonLine } from "@/components/ui/skeleton-line";

// What the order comes to, shown above the Buy and Sell buttons: the value
// moving and the fee on it.
//
// Both figures arrive display-ready. This component does no arithmetic and no
// parsing, so there is no place for a rounding error to enter; the quote that
// produced them owns the precision.

export type TradeOrderSide = "buy" | "sell";

/** The two rows' wording on one leg. */
export interface TradeOrderSummaryLegLabels {
  // The top row: what the purchase costs on a buy, what the sale pays out on a
  // sell.
  value: string;
  fee: string;
}

// Both legs' wording, not just the active leg's. The card picks the pair by
// side, which is the one thing `side` decides, and keeping that choice here
// means a desk binds its catalogue once for a ticket that flips sides rather
// than rebuilding the labels on every flip.
export interface TradeOrderSummaryLabels {
  buy: TradeOrderSummaryLegLabels;
  sell: TradeOrderSummaryLegLabels;
}

export interface TradeOrderSummaryProps {
  // Which leg the card sits above. It picks the wording and nothing else.
  // Buy is the default so the callers written before the sell leg existed
  // render exactly what they rendered before.
  side?: TradeOrderSide;
  // Formatted for display, without the symbol: "5,000", "3.50". On the buy leg
  // it is what the purchase costs, on the sell leg what the sale pays out. The
  // name is the buy leg's because the buy leg shipped first and its callers
  // still pass it.
  purchaseValue: string;
  fee: string;
  // The token both figures are quoted in, e.g. "USDC".
  symbol: string;
  // Finished strings for both legs. This primitive reads no message catalogue.
  labels: TradeOrderSummaryLabels;
  // Set while a fresh quote is in flight. The rows hold their height and show
  // placeholders instead of a stale figure.
  loading?: boolean;
}

// Fixed per row rather than per side. Both legs then draw the same two
// placeholders, so a side switch mid-quote does not resize the card.
const VALUE_SKELETON_WIDTH = "w-[5.5em]";
const FEE_SKELETON_WIDTH = "w-[4.5em]";

export function TradeOrderSummary({
  side = "buy",
  purchaseValue,
  fee,
  symbol,
  labels,
  loading = false,
}: TradeOrderSummaryProps) {
  // Two rows either way, same padding, same gap, same line box, so the card is
  // the same height on both legs and switching side does not shift the button
  // under it. Only the wording differs.
  const leg = side === "sell" ? labels.sell : labels.buy;

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
        label={leg.value}
        value={purchaseValue}
        symbol={symbol}
        loading={loading}
        skeletonWidth={VALUE_SKELETON_WIDTH}
      />
      <SummaryRow
        label={leg.fee}
        value={fee}
        symbol={symbol}
        loading={loading}
        skeletonWidth={FEE_SKELETON_WIDTH}
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
