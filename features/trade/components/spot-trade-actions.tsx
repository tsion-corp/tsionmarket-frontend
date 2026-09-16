"use client";

import { useTranslations } from "next-intl";
import {
  TradeActions,
  type SellAsset,
  type SideAsset,
  type TradeActionsProps,
  type TradeSide,
} from "@/components/ui/trade-actions";

// The spot desk's binding to the shared trade actions. The actions themselves
// live in components/ui because nothing about the rule they enforce is spot:
// one button for the chosen side, gated against that side's own asset, never
// silently dead. What is spot is the message namespace, and that is all this
// file supplies.

export type SpotTradeSide = TradeSide;
export type SpotSideAsset = SideAsset;
export type SpotSellAsset = SellAsset;

export type SpotTradeActionsProps = Omit<TradeActionsProps, "labels">;

export function SpotTradeActions(props: SpotTradeActionsProps) {
  const t = useTranslations("spot");

  // Three of the nine messages take arguments. Filling a slot is the
  // catalogue's job and the shared component has no catalogue, so those three
  // are handed over as closures over this translator and return a finished
  // sentence.
  return (
    <TradeActions
      {...props}
      labels={{
        stageWaiting: t("stageWaiting"),
        ctaEnterAmount: t("ctaEnterAmount"),
        ctaNoBalanceOf: (symbol) => t("ctaNoBalanceOf", { symbol }),
        amountTooPrecise: (symbol, decimals) => t("amountTooPrecise", { symbol, decimals }),
        amountInvalid: t("amountInvalid"),
        ctaSelect: t("ctaSelect"),
        noSellBalance: (symbol) => t("noSellBalance", { symbol }),
        buy: t("buy"),
        sell: t("sell"),
        addFunds: t("addFunds"),
      }}
    />
  );
}
