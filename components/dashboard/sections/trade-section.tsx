"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Eyebrow } from "@/components/ui/eyebrow";
import { PerpModeSwitch } from "@/components/dashboard/trade/perp-mode";
import { SpotModeSwitch } from "@/components/dashboard/trade/spot-mode";
import { PerpsView } from "@/components/dashboard/trade/perps-view";
import { MarketsView } from "@/components/dashboard/views/markets-view";

// The trade hub: spot markets and perpetuals under one section, chosen with a
// top tab so the two surfaces don't clutter the sidebar. Each tab carries its
// own simple/pro interface switch, surfaced here in the header. Only the active
// tab's body mounts, so its data hooks don't run in the background.

type Tab = "spot" | "perps";

export function TradeSection() {
  const t = useTranslations("spot");
  const tSections = useTranslations("sections");
  const [tab, setTab] = useState<Tab>("spot");
  const onPerps = tab === "perps";

  const tabs: { id: Tab; label: string }[] = [
    { id: "spot", label: t("tabSpot") },
    { id: "perps", label: t("tabPerps") },
  ];

  return (
    <div className="mx-auto w-full max-w-[1520px] p-4 sm:p-6 lg:p-8">
      <Eyebrow>{tSections("trade")}</Eyebrow>
      <div className="mt-3.5 flex flex-wrap items-center justify-between gap-3">
        <div
          className="ws-inset inline-grid grid-cols-2 gap-1 p-1"
          role="tablist"
          aria-label={t("tabsLabel")}
        >
          {tabs.map(({ id, label }) => {
            const on = id === tab;
            return (
              <button
                key={id}
                role="tab"
                aria-selected={on}
                onClick={() => setTab(id)}
                className={`cursor-pointer rounded-xl px-6 py-2 font-sans text-[13.5px] font-semibold transition-colors ${
                  on
                    ? "bg-accent/16 text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.35)]"
                    : "text-white/55 hover:text-white/80"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
        {onPerps ? <PerpModeSwitch /> : <SpotModeSwitch />}
      </div>

      <div className="mt-4">{onPerps ? <PerpsView /> : <MarketsView />}</div>
    </div>
  );
}
