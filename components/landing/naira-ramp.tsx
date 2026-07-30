import { useTranslations } from "next-intl";
import { Reveal } from "@/components/ui/reveal";
import { Eyebrow } from "@/components/ui/eyebrow";
import { CheckIcon } from "@/components/ui/icons";
import { RampCard } from "@/components/landing/ramp-card";

const POINT_KEYS = ["p1", "p2", "p3"] as const;

export function NairaRamp() {
  const t = useTranslations("landing.ramp");
  return (
    <section id="naira" className="relative z-[2] bg-black px-6 pt-[70px] pb-[60px]">
      <div className="mx-auto grid max-w-[1120px] grid-cols-1 items-center gap-12 md:grid-cols-2">
        <Reveal>
          <Eyebrow>{t("eyebrow")}</Eyebrow>
          <h2 className="ws-display mt-3.5 text-[clamp(34px,4.6vw,60px)] leading-[1.02] tracking-[-0.03em]">
            {t.rich("title", { break: () => <br /> })}
          </h2>
          <p className="mt-[18px] max-w-[44ch] text-base leading-[1.6] font-light text-white/85">
            {t("body")}
          </p>
          <div className="mt-[26px] flex flex-col gap-[13px]">
            {POINT_KEYS.map((p) => (
              <div
                key={p}
                className="flex items-center gap-[11px] text-[15px] font-light text-white/90"
              >
                <CheckIcon className="text-accent shrink-0" /> {t(p)}
              </div>
            ))}
          </div>
        </Reveal>

        <Reveal delay={0.1}>
          <RampCard />
        </Reveal>
      </div>
    </section>
  );
}
