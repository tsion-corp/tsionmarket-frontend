"use client";

import { useTranslations } from "next-intl";
import { DISCOVERY_VIEWS, type DiscoveryView } from "@/lib/meme/catalog";

// The control every catalogue list shares: the desk, the grid and the phone's
// Memecoins tab (ADR-2026-09-14-memecoins-trade-contract, slice 4).

// Curated / All over DISCOVERY_POLICY. Curated is the maintainers' filters and
// the default; All is the trade contract's view, where a thin coin is listed
// with its badge and asks for consent before a quote.
export function MemeViewSwitch({
  value,
  onChange,
  className = "",
}: {
  value: DiscoveryView;
  onChange: (view: DiscoveryView) => void;
  className?: string;
}) {
  const t = useTranslations("meme");
  return (
    <div
      role="group"
      aria-label={t("viewLabel")}
      className={`border-hairline bg-surface inline-flex h-[36px] shrink-0 items-center gap-1 rounded-full border p-[3px] ${className}`}
    >
      {DISCOVERY_VIEWS.map((view) => {
        const on = view === value;
        return (
          <button
            key={view}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(view)}
            className={`h-full cursor-pointer rounded-full px-3 font-sans text-[12px] font-semibold transition-colors ${
              on ? "bg-white text-black" : "text-white/60 hover:text-white"
            }`}
          >
            {view === "curated" ? t("viewCurated") : t("viewAll")}
          </button>
        );
      })}
    </div>
  );
}
