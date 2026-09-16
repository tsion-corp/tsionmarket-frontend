"use client";

import dynamic from "next/dynamic";

import { useTranslations } from "next-intl";
import { Eyebrow } from "@/components/ui/eyebrow";
import { SpotModeSwitch, useSpotMode } from "@/features/trade/components/spot-mode";
import { SpotSimpleView } from "@/features/trade/components/spot-simple-view";

// The frame the pro terminal's chunk lands into: its phone search pill and the
// first rows of its market list, at the sizes the real thing draws them, so the
// section does not jump when the code arrives.
function ProTerminalPending() {
  const t = useTranslations("spot");
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">{t("loadingMarkets")}</span>
      <div className="ws-inset h-[42px] animate-pulse" />
      <div className="ws-card mt-3 overflow-hidden">
        {[0, 1, 2, 3, 4].map((row) => (
          <div key={row} className="flex items-center gap-3 border-b border-white/6 px-4 py-3.5">
            <span className="size-9 shrink-0 animate-pulse rounded-full bg-white/8" />
            <span className="h-4 w-24 animate-pulse rounded bg-white/8" />
            <span className="ml-auto h-4 w-16 animate-pulse rounded bg-white/8" />
          </div>
        ))}
      </div>
    </div>
  );
}

// Dynamic: the pro desk carries lightweight-charts and a data-table, and it
// only renders for someone who has flipped the mode switch. Statically
// imported it shipped in every dashboard payload, including the default
// simple view that draws no chart at all.
//
// The loading frame is not optional. Without one, the flip to pro paints an
// empty region for as long as the chunk takes on a phone connection, and
// nothing on screen tells the reader whether it is slow or broken.
const MarketsView = dynamic(
  () => import("@/features/trade/components/markets-view").then((m) => m.MarketsView),
  { ssr: false, loading: () => <ProTerminalPending /> }
);

// Spot as its own sidebar section, with two interfaces behind the header
// switch. Simple is the tabular market list for people who just want to look
// an asset up and buy it through the familiar sheet flow; pro is the trading
// terminal with candles and the order ticket.
//
// Both interfaces are offered at every width. On a phone the pro terminal
// shows its market list here and moves the chart and the ticket into a
// full-screen sheet, so choosing pro does not bury the rest of the dashboard
// under one very long section.
export function SpotSection() {
  const tSections = useTranslations("sections");
  const { mode } = useSpotMode();

  // 20px gutters on a phone, which is the Market design's own column: a 362px
  // body in a 402px frame (Figma 1:7825). The wider steps are unchanged.
  return (
    <div className="mx-auto w-full max-w-[1520px] p-5 sm:p-6 lg:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Eyebrow>{tSections("spot")}</Eyebrow>
        <SpotModeSwitch />
      </div>
      <div className="mt-4">{mode === "pro" ? <MarketsView /> : <SpotSimpleView />}</div>
    </div>
  );
}
