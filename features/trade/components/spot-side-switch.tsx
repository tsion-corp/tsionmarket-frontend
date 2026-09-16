"use client";

import { useTranslations } from "next-intl";

import { TradeSideSwitch, type TradeSide } from "@/components/ui/trade-side-switch";

// The spot desk's binding to the shared side switch. The switch itself lives in
// components/ui because nothing about two pills that pick a leg is spot. What
// is spot is the message namespace the wording comes from, and that is all this
// file supplies.

/** Which leg of the ticket is being entered. */
export type SpotSide = TradeSide;

export interface SpotSideSwitchProps {
  side: SpotSide;
  onChange: (side: SpotSide) => void;
  /** Set while an order is in flight, so the side cannot move under a signature. */
  disabled?: boolean;
}

export function SpotSideSwitch({ side, onChange, disabled = false }: SpotSideSwitchProps) {
  const t = useTranslations("spot");

  return (
    <TradeSideSwitch
      side={side}
      onChange={onChange}
      disabled={disabled}
      labels={{ group: t("sideLabel"), buy: t("buy"), sell: t("sell") }}
    />
  );
}
