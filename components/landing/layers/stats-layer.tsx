import { useTranslations } from "next-intl";
import { CopyLayer, RevealItem } from "@/components/landing/layers/reveal-item";

// Waypoint 6 — Stats. Four proof points; copy lives in the landing.how catalog.
export function StatsLayer() {
  const t = useTranslations("landing.how");
  const stats = [
    { figure: "12,000+", label: t("statWaitlist") },
    { figure: t("statMarketsValue"), label: t("statMarketsLabel") },
    { figure: "100%", label: t("statCustody") },
    { figure: "24/7", label: t("statAccess") },
  ];
  return (
    <CopyLayer index={6} className="px-6 pt-[104px] pb-[72px]">
      <div className="mx-auto grid w-full max-w-[1120px] [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))] gap-4">
        {stats.map((s) => (
          <RevealItem
            key={s.label}
            className="rounded-[20px] border border-white/10 bg-white/4 px-[26px] py-[30px] text-center backdrop-blur-[14px]"
          >
            <div className="ws-display text-[clamp(30px,3.4vw,44px)] leading-[0.85] text-[#d4d4d8]">
              {s.figure}
            </div>
            <div className="mt-3 text-[13px] font-normal text-[rgba(244,244,244,0.7)]">
              {s.label}
            </div>
          </RevealItem>
        ))}
      </div>
    </CopyLayer>
  );
}
