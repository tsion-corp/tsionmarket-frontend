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
      <span className="relative flex w-full items-center gap-4 px-5 py-7 sm:gap-5 sm:px-7 sm:py-8">
        <span className="grid h-16 w-16 shrink-0 place-items-center rounded-[18px] border border-white/15 bg-white/10 text-white backdrop-blur-sm sm:h-[68px] sm:w-[68px]">
          <GlobeIcon size={32} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2.5">
            <span className="font-sans text-[17px] font-semibold text-white sm:text-[19px]">
              {t("title")}
            </span>
            <span className="rounded-full border border-white/25 bg-white/12 px-2 py-0.5 text-[10px] font-medium tracking-[0.06em] text-white uppercase backdrop-blur-sm">
              {t("badge")}
            </span>
          </span>
          <span className="mt-1.5 block text-[13.5px] leading-[1.5] font-normal text-white/75 sm:text-[14.5px]">
            {t("subtitle")}
          </span>
        </span>
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white text-[#0b1220] transition-transform group-hover:translate-x-0.5">
          <ArrowRightIcon size={18} />
        </span>
      </span>
    </button>
  );
}
