import { useTranslations } from "next-intl";
import { Eyebrow } from "@/components/ui/eyebrow";
import { CopyLayer, RevealItem } from "@/components/landing/layers/reveal-item";

const STEPS = [
  { num: "01", k: "s1" },
  { num: "02", k: "s2" },
  { num: "03", k: "s3" },
] as const;

// Waypoint 5 — How it works. Three numbered steps from sign-in to first trade.
export function HowLayer() {
  const t = useTranslations("landing.how");
  return (
    <CopyLayer index={5} anchorId="how" className="px-6 pt-[104px] pb-[72px]">
      <div className="mx-auto w-full max-w-[1120px]">
        <RevealItem className="mb-10 text-center">
          <Eyebrow>{t("eyebrow")}</Eyebrow>
          <h2 className="ws-display mx-auto mt-3.5 max-w-[24ch] text-[clamp(32px,4.8vw,58px)] leading-[0.96] tracking-[-0.03em]">
            {t("title")}
          </h2>
        </RevealItem>
        <div className="grid [grid-template-columns:repeat(auto-fit,minmax(260px,1fr))] gap-[18px]">
          {STEPS.map((s) => (
            <RevealItem
              key={s.k}
              className="rounded-[22px] border border-white/12 bg-white/5 p-[30px] shadow-[inset_0_1px_0_rgba(255,255,255,0.15)] backdrop-blur-[14px]"
            >
              <div className="ws-display text-[44px] leading-[0.8] text-[#d4d4d8]">{s.num}</div>
              <h3 className="ws-display mt-5 text-[24px]">{t(`${s.k}Title`)}</h3>
              <p className="mt-2.5 text-[15px] font-light text-[rgba(244,244,244,0.82)]">
                {t(`${s.k}Body`)}
              </p>
            </RevealItem>
          ))}
        </div>
      </div>
    </CopyLayer>
  );
}
