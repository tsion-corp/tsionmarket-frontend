"use client";

import dynamic from "next/dynamic";

import { useTranslations } from "next-intl";
import { Eyebrow } from "@/components/ui/eyebrow";
import { SpotModeSwitch, useSpotMode } from "@/features/trade/components/spot-mode";
// Dynamic: the pro desk carries lightweight-charts and a data-table, and it
// only renders for someone who has flipped the mode switch. Statically
// imported it shipped in every dashboard payload, including the default
// simple view that draws no chart at all.
const MarketsView = dynamic(
  () => import("@/features/trade/components/markets-view").then((m) => m.MarketsView),
  { ssr: false }
);
import { SpotSimpleView } from "@/features/trade/components/spot-simple-view";
import type { BuyPayload, DetailPayload } from "@/lib/modal-types";

interface SpotSectionProps {
  onOpenDetail: (detail: DetailPayload) => void;
  onOpenBuy: (buy: BuyPayload) => void;
}

// Spot as its own sidebar section, with two interfaces behind the header
// switch. Simple is the tabular market list for people who just want to look
// an asset up and buy it through the familiar sheet flow; pro is the trading
// terminal with candles and the order ticket.
//
// Both interfaces are offered at every width. On a phone the pro terminal
// shows its market list here and moves the chart and the ticket into a
// full-screen sheet, so choosing pro does not bury the rest of the dashboard
// under one very long section.
export function SpotSection({ onOpenDetail, onOpenBuy }: SpotSectionProps) {
  const tSections = useTranslations("sections");
  const { mode } = useSpotMode();

  return (
    <div className="mx-auto w-full max-w-[1520px] p-4 sm:p-6 lg:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Eyebrow>{tSections("spot")}</Eyebrow>
        <SpotModeSwitch />
      </div>
      <div className="mt-4">
        {mode === "pro" ? (
          <MarketsView />
        ) : (
          <SpotSimpleView onOpenDetail={onOpenDetail} onOpenBuy={onOpenBuy} />
        )}
      </div>
    </div>
  );
}
