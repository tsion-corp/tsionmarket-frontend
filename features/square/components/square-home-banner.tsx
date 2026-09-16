"use client";

import { useTranslations } from "next-intl";
import { squareLinks } from "@/lib/square/links";

const GROUND = "bg-[linear-gradient(90deg,#AD46FF_-16.5%,#682A99_82%)]";

/**
 * Home's gistroom banner, the Square's own carried over
 * (market-square-frontend/components/layout/home-banner.tsx, nodes
 * 1295:142736 and 1305:149178): the mascot, the arcs at soft light, the
 * title and its line, and the white "Host Room". Two drawings, one for a
 * phone and one from md, as the file has them.
 *
 * Hosting a room is the Square's, so the button leaves for its rooms page
 * with the create sheet open, which is where the Square's own button lands.
 */
export function SquareHomeBanner() {
  const t = useTranslations("square");
  const href = squareLinks.hostRoom();
  if (!href) return null;

  const action = (className: string) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
      {t("bannerAction")}
    </a>
  );

  return (
    <section aria-label={t("bannerTitle")} className="mb-8">
      <div
        className={`relative flex h-[66px] items-center rounded-[10px] pr-4 pl-[72px] md:hidden ${GROUND}`}
      >
        <span className="pointer-events-none absolute bottom-[9px] left-[30px] h-1 w-7 rounded-[50%] bg-black/25 blur-[1px]" />
        {/* eslint-disable-next-line @next/next/no-img-element -- the Square's own export */}
        <img
          src="/square-home/banner-mascot.png"
          alt=""
          aria-hidden
          draggable={false}
          className="pointer-events-none absolute bottom-0 left-4 h-[62px] w-[58px] object-contain object-top select-none"
        />
        <p className="min-w-0 flex-1 font-[family-name:var(--font-heading)] text-[13px] leading-[16px] font-bold text-white">
          {t("bannerTitle")}
        </p>
        {action(
          "ws-pressable ml-3 flex h-7 shrink-0 items-center rounded-full bg-white px-3 text-[12px] leading-none font-bold text-[#682A98] transition-opacity hover:opacity-90"
        )}
      </div>

      <div
        className={`relative hidden h-[102px] overflow-hidden rounded-[10px] md:block ${GROUND}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- the Square's own export */}
        <img
          src="/square-home/banner-arc-left.svg"
          alt=""
          aria-hidden
          className="pointer-events-none absolute top-[-57.22px] left-[-4.12px] h-[106px] w-[256px] max-w-none mix-blend-soft-light select-none"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute top-[88.63px] left-[33.74px] h-[6.06px] w-[42.39px] rounded-[50%] bg-black/25 blur-[3.03px]"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute top-[-12px] left-[5px] h-[96.29px] w-[98.96px] overflow-hidden"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- the Square's own export */}
          <img
            src="/square-home/banner-mascot.png"
            alt=""
            draggable={false}
            className="h-[148.46px] w-[98.96px] max-w-none select-none"
          />
        </span>
        <p className="absolute top-[27.76px] left-[103.55px] flex h-[44px] w-[329px] flex-col justify-center">
          <span className="font-[family-name:var(--font-heading)] text-[24px] leading-[32.784px] font-bold text-white">
            {t("bannerTitle")}
          </span>
          <span className="text-[10px] leading-[14.51px] font-medium text-[#E9CEFF]">
            {t("bannerSubtitle")}
          </span>
        </p>
        {/* eslint-disable-next-line @next/next/no-img-element -- the Square's own export */}
        <img
          src="/square-home/banner-arc-right.svg"
          alt=""
          aria-hidden
          className="pointer-events-none absolute top-[16.41px] left-[204.87px] h-[153px] w-[369px] max-w-none mix-blend-soft-light select-none"
        />
        {action(
          "ws-pressable absolute top-[32px] right-[25px] flex h-[38px] w-[90px] items-center justify-center rounded-full bg-white text-[12.44px] leading-[16.59px] font-bold text-[#682A98] shadow-[inset_0_0_0_2px_rgba(194,160,250,0.55),0_6px_6.2px_rgba(0,0,0,0.25)] transition-opacity hover:opacity-90"
        )}
      </div>
    </section>
  );
}
