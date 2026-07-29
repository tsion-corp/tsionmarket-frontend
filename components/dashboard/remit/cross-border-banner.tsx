"use client";

import { GlobeIcon, ArrowRightIcon } from "@/components/ui/icons";

interface CrossBorderBannerProps {
  onClick: () => void;
}

// The entry point to cross-border payments, placed right under the balance card.
// Tapping it opens the send-money flow. Styled as an accent strip so it reads as
// a feature, not another holding row.
export function CrossBorderBanner({ onClick }: CrossBorderBannerProps) {
  return (
    <button
      onClick={onClick}
      className="group relative flex w-full cursor-pointer items-center gap-3.5 overflow-hidden rounded-[18px] border border-white/12 bg-[linear-gradient(105deg,rgba(255,255,255,0.16),rgba(255,255,255,0.05)_46%,rgba(255,255,255,0.02))] px-4 py-3.5 text-left transition-colors hover:border-white/20 sm:px-[18px]"
    >
      {/* Soft glow anchored to the icon, purely decorative. */}
      <span
        aria-hidden
        className="bg-accent/25 pointer-events-none absolute -top-10 -left-6 h-28 w-28 rounded-full blur-2xl"
      />
      <span className="bg-accent/18 text-accent relative grid h-11 w-11 shrink-0 place-items-center rounded-[13px]">
        <GlobeIcon size={22} />
      </span>
      <span className="relative min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="font-sans text-[14.5px] font-semibold text-white">
            Send money across borders
          </span>
          <span className="border-accent/30 bg-accent/14 text-accent rounded-full border px-2 py-0.5 text-[10px] font-medium tracking-[0.06em] uppercase">
            New
          </span>
        </span>
        <span className="mt-0.5 block truncate text-[12.5px] leading-[1.4] font-normal text-white/60">
          Pay vendors in Kenya, Ghana & more. They get local cash instantly.
        </span>
      </span>
      <span className="relative text-white/40 transition-transform group-hover:translate-x-0.5">
        <ArrowRightIcon size={17} />
      </span>
    </button>
  );
}
