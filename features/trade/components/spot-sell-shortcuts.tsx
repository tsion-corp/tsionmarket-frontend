"use client";

import { useTranslations } from "next-intl";

import { TradeSellShortcuts } from "@/components/ui/trade-sell-shortcuts";

// The spot desk's binding to the shared share-of-balance row. The arithmetic
// and the pills live in components/ui; taking 25% of a base-unit balance is not
// a spot idea. This file only names the row and its Max pill from the spot
// catalogue.

export interface SpotSellShortcutsProps {
  /** The holding, in the asset's own base units. Null when it cannot be read. */
  held: bigint | null;
  decimals: number;
  /** Receives a decimal string, the same shape the amount field holds. */
  onSelect: (amount: string) => void;
  disabled?: boolean;
}

export function SpotSellShortcuts({
  held,
  decimals,
  onSelect,
  disabled = false,
}: SpotSellShortcutsProps): React.ReactElement {
  const t = useTranslations("spot");

  return (
    <TradeSellShortcuts
      held={held}
      decimals={decimals}
      onSelect={onSelect}
      disabled={disabled}
      labels={{ group: t("sellShortcutsLabel"), max: t("max") }}
    />
  );
}
