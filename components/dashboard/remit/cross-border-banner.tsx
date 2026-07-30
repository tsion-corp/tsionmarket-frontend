"use client";

import { GlobeIcon, ArrowRightIcon } from "@/components/ui/icons";

interface CrossBorderBannerProps {
  onClick: () => void;
}

// The entry point to cross-border payments, placed right under the balance card.
// Tapping it opens the send-money flow. Deliberately tall and high-contrast so it
// reads as a headline feature no one scrolls past, not another list row.
export function CrossBorderBanner({ onClick }: CrossBorderBannerProps) {
  return (
    <button
      onClick={onClick}
      className="group relative flex w-full cursor-pointer items-center gap-4 overflow-hidden rounded-[20px] border border-white/14 bg-[linear-gradient(105deg,rgba(255,255,255,0.16),rgba(255,255,255,0.05)_46%,rgba(255,255,255,0.02))] px-5 py-7 text-left transition-colors hover:border-white/25 sm:gap-5 sm:px-7 sm:py-8"
    >
      {/* Soft glow anchored to the icon, purely decorative. */}
      <span
        aria-hidden
        className="bg-accent/25 pointer-events-none absolute -top-16 -left-8 h-48 w-48 rounded-full blur-3xl"
      />
      <span className="bg-accent/18 text-accent relative grid h-16 w-16 shrink-0 place-items-center rounded-[18px] sm:h-[68px] sm:w-[68px]">
        <GlobeIcon size={32} />
      </span>
      <span className="relative min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2.5">
          <span className="font-sans text-[17px] font-semibold text-white sm:text-[19px]">
            Send money across borders
          </span>
          <span className="border-accent/30 bg-accent/14 text-accent rounded-full border px-2 py-0.5 text-[10px] font-medium tracking-[0.06em] uppercase">
            New
          </span>
        </span>
        <span className="mt-1.5 block text-[13.5px] leading-[1.5] font-normal text-white/65 sm:text-[14.5px]">
          Pay vendors in Kenya, Ghana & more. They get local cash instantly.
        </span>
      </span>
      <span className="relative grid h-10 w-10 shrink-0 place-items-center rounded-full border border-white/14 bg-white/6 text-white/70 transition-all group-hover:translate-x-0.5 group-hover:bg-white/10 group-hover:text-white">
        <ArrowRightIcon size={18} />
      </span>
    </button>
  );
}
