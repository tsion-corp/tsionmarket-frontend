"use client";

import { useTranslations } from "next-intl";
import { Eyebrow } from "@/components/ui/eyebrow";
import { MemeModeSwitch, useMemeMode } from "@/features/trade/components/meme-mode";
import { MemeSimpleView } from "@/features/trade/components/meme-simple-view";
import { MemeProView } from "@/features/trade/components/meme-pro-view";
import { MemecoinPromos } from "@/features/trade/components/memecoin-promos";
import { SectionVisibility } from "@/components/ui/section-visibility";

// Memecoin trading on Base: trending cards for the simple interface, the
// search/table/chart desk for pro. Both trade through the same sheet.
//
// Both interfaces are offered at every width; pro keeps its table here on a
// phone and moves the chart and the trade card into a full-screen sheet.
export function MemeSection() {
  const tSections = useTranslations("sections");
  const { mode } = useMemeMode();

  return (
    <SectionVisibility className="mx-auto w-full max-w-[1520px] p-4 sm:p-6 lg:p-8">
      <div className="hidden flex-wrap items-center justify-between gap-3 sm:flex">
        <Eyebrow>{tSections("meme")}</Eyebrow>
        <MemeModeSwitch />
      </div>
      {/* Mobile: "Stay Ahead of Token Moves" promo cards only.
          The trending strip, filter chips and token table are commented out. */}
      <div className="sm:hidden">
        {/* "Find the next 100X" header + Shiba/Pepe promo banners */}
        <div className="flex items-center gap-[3px]">
          <span className="ws-display text-[16px] leading-[1.1] tracking-[-0.32px] text-white">
            Find the next <span className="tracking-[-0.64px] text-[#ddb4fd]">100X</span>
          </span>
          <svg viewBox="0 0 20 20" aria-hidden className="h-5 w-5 shrink-0" fill="none">
            <path
              d="M7.5 4l6 6-6 6"
              stroke="white"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <div className="mt-4">
          <MemecoinPromos />
        </div>
      </div>
      <div className="mt-4 hidden sm:block">
        {mode === "pro" ? <MemeProView /> : <MemeSimpleView />}
      </div>
    </SectionVisibility>
  );
}
