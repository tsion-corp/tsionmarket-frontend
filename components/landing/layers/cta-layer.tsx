import { useTranslations } from "next-intl";
import Link from "next/link";
import { BRAND } from "@/lib/brand";
import { ArrowUpRightIcon } from "@/components/ui/icons";
import { CopyLayer, RevealItem } from "@/components/landing/layers/reveal-item";

// Waypoint 8 — Final CTA. The closing ask with the solid white button.
export function CtaLayer() {
  const t = useTranslations("landing.cta");
  return (
    <CopyLayer
      index={8}
      anchorId="early"
      className="items-center px-6 pt-[104px] pb-[72px] text-center"
    >
      <div className="w-full max-w-[760px]">
        <RevealItem duration={1}>
          <h2 className="ws-display mx-auto max-w-[18ch] text-[clamp(38px,6.2vw,84px)] leading-none tracking-[-0.03em]">
            {t("title")}
          </h2>
        </RevealItem>
        <RevealItem duration={1}>
          <p className="mx-auto mt-[22px] max-w-[48ch] text-[17px] leading-[1.6] font-light text-[rgba(244,244,244,0.9)]">
            {t("body", { brand: BRAND })}
          </p>
        </RevealItem>
        <RevealItem duration={1} className="pointer-events-auto mt-8 flex justify-center">
          <Link
            href="/auth"
            className="inline-flex items-center gap-2 rounded-full bg-white px-[26px] py-[15px] text-[15px] font-semibold text-[#0a0a0a] hover:opacity-90"
          >
            {t("getStarted")}
            <ArrowUpRightIcon className="text-[#8a8a8f]" />
          </Link>
        </RevealItem>
        <RevealItem duration={1}>
          <p className="mt-3.5 text-[13px] font-normal text-[rgba(244,244,244,0.6)]">
            {t("footnote")}
          </p>
        </RevealItem>
      </div>
    </CopyLayer>
  );
}
