import { useTranslations } from "next-intl";
import { Reveal } from "@/components/ui/reveal";
import { Eyebrow } from "@/components/ui/eyebrow";

// Numbers stay literal; titles and bodies come from the landing.how catalog.
const STEPS = [
  { n: "01", titleKey: "s1Title", bodyKey: "s1Body" },
  { n: "02", titleKey: "s2Title", bodyKey: "s2Body" },
  { n: "03", titleKey: "s3Title", bodyKey: "s3Body" },
] as const;

export function HowItWorks() {
  const t = useTranslations("landing.how");
  const stats = [
    { value: "12,000+", label: t("statWaitlist") },
    { value: t("statMarketsValue"), label: t("statMarketsLabel") },
    { value: "100%", label: t("statCustody") },
    { value: "24/7", label: t("statAccess") },
  ];
  return (
    <section id="how" className="relative z-[2] bg-black px-6 pt-[70px] pb-[60px]">
      <div className="mx-auto max-w-[1120px]">
        <Reveal className="mb-[46px] text-center">
          <Eyebrow>{t("eyebrow")}</Eyebrow>
          <h2 className="ws-display mx-auto mt-3.5 max-w-[24ch] text-[clamp(34px,4.8vw,60px)] leading-[0.94] tracking-[-0.03em]">
            {t("title")}
          </h2>
        </Reveal>
        <div className="grid grid-cols-1 gap-[18px] md:grid-cols-3">
          {STEPS.map((s, i) => (
            <Reveal
              key={s.n}
              delay={i * 0.08}
              className="rounded-[22px] border border-white/12 bg-white/5 p-[30px] shadow-[inset_0_1px_0_rgba(255,255,255,0.15)] backdrop-blur-[14px]"
            >
              <span className="ws-display text-accent text-[44px] leading-[0.8]">{s.n}</span>
              <h3 className="ws-display mt-5 text-2xl tracking-[-0.01em]">{t(s.titleKey)}</h3>
              <p className="mt-2.5 text-[15px] leading-[1.55] font-light text-white/82">
                {t(s.bodyKey)}
              </p>
            </Reveal>
          ))}
        </div>
        <div className="mt-[46px] grid grid-cols-2 gap-4 md:grid-cols-4">
          {stats.map((s, i) => (
            <Reveal
              key={s.label}
              delay={i * 0.06}
              className="rounded-[20px] border border-white/10 bg-white/4 p-[26px] text-center"
            >
              <div className="ws-display text-accent text-[clamp(30px,3.4vw,44px)] leading-[0.85]">
                {s.value}
              </div>
              <div className="mt-2 text-[13px] font-normal text-white/70">{s.label}</div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
