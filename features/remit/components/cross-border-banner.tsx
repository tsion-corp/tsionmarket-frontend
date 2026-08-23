"use client";

import { useTranslations } from "next-intl";
import { GlobeIcon, ArrowRightIcon } from "@/components/ui/icons";

// Earth at night (Unsplash, hotlink-verified), CDN-cropped to banner shape.
const BANNER_IMG =
  "https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=70&w=1400&h=300&fit=crop&crop=entropy";

interface CrossBorderBannerProps {
  onClick: () => void;
}

// The entry point to cross-border payments, placed right under the balance card.
// Tapping it opens the send-money flow.
export function CrossBorderBanner({ onClick }: CrossBorderBannerProps) {
  const t = useTranslations("remitBanner");
  return (
    <button
      onClick={onClick}
      className="group relative flex w-full cursor-pointer items-center gap-4 overflow-hidden rounded-[20px] border border-white/14 text-left transition-colors hover:border-white/30 sm:gap-5"
      style={{
        // Fallback while the photo loads or if it fails.
        background: "linear-gradient(105deg, #0b1220 0%, #101a2e 55%, #1a2a4a 100%)",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={BANNER_IMG} alt="" className="absolute inset-0 h-full w-full object-cover" />
      <span
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(90deg, rgba(5,8,16,0.92) 0%, rgba(5,8,16,0.72) 45%, rgba(5,8,16,0.28) 75%, rgba(5,8,16,0.1) 100%)",
        }}
      />
      {/* Sweeping sheen, same idiom as the Kash banner but quieter. */}
      <span
        aria-hidden
        className="absolute inset-y-0 w-1/4"
        style={{
          background: "linear-gradient(90deg, transparent, rgba(190,215,255,0.16), transparent)",
          animation: "kash-sheen 4.5s ease-in-out infinite",
        }}
      />
      <span className="relative flex w-full items-center gap-3.5 px-4 py-5 sm:gap-5 sm:px-7 sm:py-8">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[14px] border border-white/15 bg-white/10 text-white backdrop-blur-sm sm:h-[68px] sm:w-[68px] sm:rounded-[18px]">
          <GlobeIcon size={24} className="sm:hidden" />
          <GlobeIcon size={32} className="hidden sm:block" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2.5">
            <span className="ws-display text-[15px] leading-[1.2] text-white sm:text-[20px] sm:leading-normal">
              {t("title")}
            </span>
            <span className="rounded-full border border-white/25 bg-white/12 px-1.5 py-0.5 text-[9px] font-medium tracking-[0.06em] text-white uppercase backdrop-blur-sm sm:px-2 sm:text-[10px]">
              {t("badge")}
            </span>
          </span>
          <span className="mt-1 block text-[11.5px] leading-[1.4] font-normal text-white/75 sm:mt-1.5 sm:text-[14.5px] sm:leading-[1.5]">
            {t("subtitle")}
          </span>
        </span>
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white text-[#0b1220] transition-transform group-hover:translate-x-0.5 sm:h-10 sm:w-10">
          <ArrowRightIcon size={16} />
        </span>
      </span>
    </button>
  );
}
