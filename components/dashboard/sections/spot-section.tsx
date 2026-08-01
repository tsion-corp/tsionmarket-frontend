"use client";

import { useTranslations } from "next-intl";
import { Eyebrow } from "@/components/ui/eyebrow";
import { SpotModeSwitch, useSpotMode } from "@/components/dashboard/trade/spot-mode";
import { MarketsView } from "@/components/dashboard/views/markets-view";
import { SpotSimpleView } from "@/components/dashboard/views/spot-simple-view";
import type { BuyPayload, DetailPayload } from "@/components/dashboard/modal-types";

interface SpotSectionProps {
  onOpenDetail: (detail: DetailPayload) => void;
  onOpenBuy: (buy: BuyPayload) => void;
}

// Spot as its own sidebar section, with two interfaces behind the header
// switch. Simple is the tabular market list for people who just want to look
// an asset up and buy it through the familiar sheet flow; pro is the trading
// terminal with candles and the order ticket.
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
