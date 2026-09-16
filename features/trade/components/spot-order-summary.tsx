"use client";

import { useTranslations } from "next-intl";

import { TradeOrderSummary, type TradeOrderSide } from "@/components/ui/trade-order-summary";

// The spot desk's binding to the shared order summary. The card lives in
// components/ui; a value line and a fee line are not a spot idea. This file
// supplies the spot wording for both legs and nothing else.

export type SpotOrderSide = TradeOrderSide;

export interface SpotOrderSummaryProps {
  // Which leg the card sits above. It picks the wording and nothing else.
  // Buy is the default so the callers written before the sell leg existed
  // render exactly what they rendered before.
  side?: SpotOrderSide;
  // Formatted for display, without the symbol: "5,000", "3.50". On the buy leg
  // it is what the purchase costs, on the sell leg what the sale pays out. The
  // name is the buy leg's because the buy leg shipped first and its callers
  // still pass it.
  purchaseValue: string;
  fee: string;
  // The token both figures are quoted in, e.g. "USDC".
  symbol: string;
  // Set while a fresh quote is in flight. The rows hold their height and show
  // placeholders instead of a stale figure.
  loading?: boolean;
}

export function SpotOrderSummary({
  side = "buy",
  purchaseValue,
  fee,
  symbol,
  loading = false,
}: SpotOrderSummaryProps) {
  const t = useTranslations("spot");

  return (
    <TradeOrderSummary
      side={side}
      purchaseValue={purchaseValue}
      fee={fee}
      symbol={symbol}
      loading={loading}
      labels={{
        buy: { value: t("purchaseValue"), fee: t("fee") },
        sell: { value: t("youReceive"), fee: t("estFee") },
      }}
    />
  );
}
