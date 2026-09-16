"use client";

import { useTranslations } from "next-intl";

import { TradeQuickAmounts } from "@/components/ui/trade-quick-amounts";

// The spot desk's binding to the shared quick-amount chips. The chips live in
// components/ui; what stays here is the spot wording and the spot set of
// amounts.

// The design's chip row is $10, $20, $50, $100, $100, $200 (Figma nodes
// 173:42208 through 173:42213). The fifth chip repeats the fourth, which is a
// defect in the file rather than a second $100 button, so the default set
// carries five distinct amounts. Which amounts to offer is a spot decision, so
// the list stays on this side of the line.
export const SPOT_QUICK_AMOUNTS = ["10", "20", "50", "100", "200"] as const;

export interface SpotQuickAmountsProps {
  // Decimal strings, no currency symbol and no grouping. A repeated value
  // renders once.
  values: readonly string[];
  // Called with the chip's value, unchanged.
  onSelect: (value: string) => void;
  // The value currently in the amount field, when it matches a chip.
  selected?: string | null;
  // Set while an order is in flight.
  disabled?: boolean;
  // Sits in front of each chip's number. The chips are dollar presets.
  prefix?: string;
}

export function SpotQuickAmounts({
  values,
  onSelect,
  selected = null,
  disabled = false,
  prefix = "$",
}: SpotQuickAmountsProps) {
  const t = useTranslations("spot");

  return (
    <TradeQuickAmounts
      values={values}
      onSelect={onSelect}
      selected={selected}
      disabled={disabled}
      prefix={prefix}
      // The accessible name interpolates the chip's label, so the catalogue
      // lookup is handed down as a closure rather than as a finished string.
      amountLabel={(amount) => t("quickAmountLabel", { amount })}
    />
  );
}
