"use client";

import { useTranslations } from "next-intl";

// Gold coin stack (Unsplash, hotlink-verified), cropped to banner shape by the
// CDN; the entropy crop keeps the coins in frame at any width.
const BANNER_IMG =
  "https://images.unsplash.com/photo-1755369355222-8146801ccf90?q=70&w=1400&h=340&fit=crop&crop=entropy";
// The owner's Kash coin design, cropped to a medallion by the circle mask.
const COIN = "/kash-coin.jpg";

// Blinking sparkle positions and stagger, ad-style.
const SPARKS = [
  { top: "18%", left: "6%", size: 7, delay: "0s" },
  { top: "64%", left: "15%", size: 5, delay: "0.5s" },
  { top: "22%", left: "40%", size: 6, delay: "1.1s" },
  { top: "70%", left: "58%", size: 7, delay: "0.3s" },
  { top: "16%", left: "76%", size: 5, delay: "0.8s" },
  { top: "58%", left: "90%", size: 6, delay: "1.4s" },
];

export function KashBanner({ onBuy }: { onBuy: () => void }) {
  const t = useTranslations("kash");

  return (
    <button
      onClick={onBuy}
      className="kash-banner relative block w-full cursor-pointer overflow-hidden rounded-2xl border border-amber-200/50 text-left"
      style={{
        // Fallback while the photo loads or if it fails: same gold family.
        background: "linear-gradient(100deg, #fdf3d8 0%, #f7df9c 45%, #e8b74a 100%)",
        animation: "kash-glow 2.6s ease-in-out infinite",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={BANNER_IMG} alt="" className="absolute inset-0 h-full w-full object-cover" />
      {/* Light gradient over the photo so the copy stays readable. */}
      <span
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(90deg, rgba(255,250,235,0.96) 0%, rgba(255,246,220,0.88) 42%, rgba(255,240,200,0.35) 70%, rgba(255,235,180,0.12) 100%)",
        }}
      />
      {/* Sweeping flash. */}
      <span
        aria-hidden
        className="absolute inset-y-0 w-1/4"
        style={{
          background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.75), transparent)",
          animation: "kash-sheen 2.8s ease-in-out infinite",
        }}
      />
      {SPARKS.map((s, i) => (
        <span
          key={i}
          aria-hidden
          className="absolute rounded-full bg-white"
          style={{
            top: s.top,
            left: s.left,
            width: s.size,
            height: s.size,
            boxShadow: "0 0 8px 2px rgba(255,214,90,0.95)",
            animation: `kash-blink 1.6s ease-in-out ${s.delay} infinite`,
          }}
        />
      ))}

      <span className="relative flex items-center gap-3.5 px-4 py-3.5 sm:gap-5 sm:px-6">
        <span className="relative shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={COIN}
            alt=""
            className="h-12 w-12 rounded-full object-cover shadow-[0_0_14px_rgba(180,130,20,0.55)] sm:h-14 sm:w-14"
            style={{ animation: "kash-float 3.2s ease-in-out infinite" }}
          />
        </span>
        <span className="min-w-0 flex-1">
          <span className="ws-display block text-[17px] text-amber-950 sm:text-[20px]">
            {t("bannerTitle")}
          </span>
          <span className="mt-0.5 hidden text-[12.5px] font-normal text-amber-900/75 sm:block">
            {t("bannerSub")}
          </span>
        </span>
        <span className="text-ink shrink-0 rounded-xl bg-white px-4 py-2.5 font-sans text-[13px] font-semibold shadow-[0_2px_10px_rgba(120,80,0,0.25)]">
          {t("bannerCta")}
        </span>
      </span>
    </button>
  );
}
