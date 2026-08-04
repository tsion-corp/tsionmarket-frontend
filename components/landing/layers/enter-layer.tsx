import { useTranslations } from "next-intl";
import Link from "next/link";
import { MarketLogo } from "@/components/ui/market-logo";
import { ArrowUpRightIcon } from "@/components/ui/icons";
import { CopyLayer, RevealItem } from "@/components/landing/layers/reveal-item";

// Waypoint 0 — Enter. A held composition (the engine shows it whole from the
// first paint): the Ark lockup over the single point of light, a ghost CTA,
// and the scroll cue that starts the journey.
export function EnterLayer() {
  const t = useTranslations("landing.journey");
  const tNav = useTranslations("landingNav");
  return (
    <CopyLayer index={0} anchorId="top" className="items-center px-6 py-24">
      <RevealItem className="flex flex-col items-center">
        <MarketLogo style={{ width: "min(380px, 70vw)", height: "auto" }} />
        <div className="mt-5 text-[12.5px] font-normal tracking-[0.22em] text-[#8a8a8f] uppercase min-[880px]:mt-6 min-[880px]:text-[15px]">
          {t("poweredBy", { name: "Tsion" })}
        </div>
      </RevealItem>
      <RevealItem className="pointer-events-auto mt-11">
        <Link
          href="/auth"
          className="inline-flex items-center gap-2 rounded-full border border-white/16 bg-white/8 px-6 py-[13px] text-[15px] font-medium text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] backdrop-blur-[50px] hover:bg-white/12"
        >
          {tNav("getStarted")}
          <ArrowUpRightIcon className="text-[#d4d4d8]" />
        </Link>
      </RevealItem>
      <RevealItem
        className="absolute bottom-[46px] left-1/2 flex flex-col items-center gap-2.5"
        baseTransform="translateX(-50%)"
      >
        <div className="text-[11.5px] font-medium tracking-[0.14em] text-white/55 uppercase">
          {t("scrollCue")}
        </div>
        <div className="h-11 w-px bg-gradient-to-b from-[rgba(244,244,244,0.7)] to-transparent" />
      </RevealItem>
    </CopyLayer>
  );
}
