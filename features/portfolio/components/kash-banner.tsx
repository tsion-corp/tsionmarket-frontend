"use client";

import { useTranslations } from "next-intl";

// The designer's Kash+ coin, cut from the delivered artwork and sized for a
// 75px slot at 3x.
const COIN = "/kash/kash-plus-coin.png";

// The designer's bronze K mark, watermarked across the right of the card
// behind the button. Inline so it paints with the first frame and takes its
// color from the design's own bronze, not from the theme.
function KMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 202 120" fill="none" aria-hidden className={className}>
      <path
        d="M201.715 23.3799C115.343 47.145 88.1368 76.205 62.9023 94.1992V120.001H37.0293V83.0195C84.0484 49.0329 151.459 33.3885 201.715 23.3799ZM146.733 101.818L157.182 109.646L161.72 113.045L166.214 116.412L171.005 120.001H133.632L127.885 116.001L87.54 87.9248L108.438 73.1289L146.733 101.818ZM62.6484 11.4688V25.0371H101.685L88.3047 46.4443H62.6484V59.0742L36.9043 73.1289V0L62.6484 11.4688ZM28.7988 44.8545H0L12.7432 24.9756H28.7988V44.8545Z"
        fill="#AE6A04"
        fillOpacity="0.67"
      />
    </svg>
  );
}

// The Kash promo banner, built to the designer's comp: a bronze-to-gold card,
// the coin on the left, a dark-brown headline over a white subline, the K mark
// fading in on the right, and a white pill for the call to action. The whole
// card is the button, as before. On a phone everything steps down a size, the
// way the mobile dashboard redesign sized the previous banner.
export function KashBanner({ onBuy }: { onBuy: () => void }) {
  const t = useTranslations("kash");

  return (
    <button
      onClick={onBuy}
      className="relative block w-full cursor-pointer overflow-hidden rounded-[11px] text-left transition-[filter] hover:brightness-[1.03]"
      style={{
        // The comp's gradient: bronze at the edges, the bright gold catching
        // near the left.
        background: "linear-gradient(94deg, #AC6803 0%, #F7D535 8%, #AD6803 100%)",
      }}
    >
      <KMark className="pointer-events-none absolute top-1/2 right-[6%] h-[150%] w-auto -translate-y-1/2 sm:right-[8%]" />

      <span className="relative flex items-center gap-3 px-3.5 py-2.5 sm:gap-5 sm:px-6 sm:py-2.5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={COIN}
          alt=""
          width={75}
          height={75}
          className="h-10 w-10 shrink-0 drop-shadow-[0_4px_10px_rgba(90,50,0,0.35)] sm:h-[75px] sm:w-[75px]"
        />
        <span className="min-w-0 flex-1">
          <span className="block font-sans text-[13.5px] leading-[1.25] font-bold text-[#6C2B09] sm:text-[20px] sm:leading-tight">
            {t("bannerTitle")}
          </span>
          <span className="mt-1 hidden text-[13.5px] font-normal text-white sm:block">
            {t("bannerSub")}
          </span>
        </span>
        <span className="shrink-0 rounded-lg bg-[#F5F5F5] px-3 py-2 font-sans text-[11.5px] font-semibold whitespace-nowrap text-[#0A0A0A] shadow-[0_0_0_3px_rgba(255,255,255,0.2),0_2px_10px_rgba(120,80,0,0.25)] sm:px-5 sm:text-[14px]">
          {t("bannerCta")}
        </span>
      </span>
    </button>
  );
}
