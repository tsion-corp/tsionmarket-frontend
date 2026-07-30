import { useTranslations } from "next-intl";
import { Eyebrow } from "@/components/ui/eyebrow";
import { CheckIcon } from "@/components/ui/icons";
import { RampCard } from "@/components/landing/ramp-card";
import { CopyLayer, RevealItem } from "@/components/landing/layers/reveal-item";

const POINT_KEYS = ["p1", "p2", "p3"] as const;

// Waypoint 4 — Ramp. The cash-in pitch beside the live NGN converter card.
export function RampLayer() {
  const t = useTranslations("landing.ramp");
  return (
    <CopyLayer index={4} anchorId="naira" className="px-6 pt-[104px] pb-[72px]">
      <div className="mx-auto grid w-full max-w-[1120px] [grid-template-columns:repeat(auto-fit,minmax(320px,1fr))] items-center gap-11">
        <RevealItem>
          <Eyebrow>{t("eyebrow")}</Eyebrow>
          <h2 className="ws-display mt-3.5 text-[clamp(32px,4.4vw,58px)] leading-[1.02] tracking-[-0.03em]">
            {t.rich("title", { break: () => <br /> })}
          </h2>
          <p className="mt-[18px] max-w-[44ch] text-[16px] leading-[1.6] font-light text-[rgba(244,244,244,0.85)]">
            {t("body")}
          </p>
          <div className="mt-[26px] flex flex-col gap-[13px]">
            {POINT_KEYS.map((k) => (
              <div key={k} className="flex items-center gap-2.5">
                <CheckIcon size={18} className="shrink-0 text-[#d4d4d8]" />
                <span className="text-[15px] font-light text-[rgba(244,244,244,0.9)]">{t(k)}</span>
              </div>
            ))}
          </div>
        </RevealItem>
        <RevealItem className="pointer-events-auto">
          <RampCard />
        </RevealItem>
      </div>
    </CopyLayer>
  );
}
