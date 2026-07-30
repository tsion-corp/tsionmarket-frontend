import { BRAND } from "@/lib/brand";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Reveal } from "@/components/ui/reveal";
import { AuroraHeroBackground } from "@/components/landing/aurora-hero-bg";
import { ArrowUpRightIcon } from "@/components/ui/icons";

export function FinalCta() {
  const t = useTranslations("landing.cta");
  return (
    <section
      id="early"
      className="relative flex min-h-[80vh] items-center justify-center overflow-hidden"
    >
      <AuroraHeroBackground />
      <div className="absolute inset-0 z-[1] bg-[linear-gradient(180deg,rgba(0,0,0,0.82)_0%,rgba(0,0,0,0.5)_45%,rgba(0,0,0,0.9)_100%)]" />
      <Reveal className="relative z-10 max-w-[760px] px-6 text-center">
        <h2 className="ws-display mx-auto max-w-[18ch] text-[clamp(40px,6.5vw,88px)] leading-none tracking-[-0.03em]">
          {t("title")}
        </h2>
        <p className="mx-auto mt-[22px] max-w-[48ch] text-[17px] leading-[1.6] font-light text-white/90">
          {t("body", { brand: BRAND })}
        </p>
        <div className="mt-8 flex justify-center">
          <Link
            href="/auth"
            className="text-ink inline-flex items-center gap-2 rounded-full bg-white px-[26px] py-[15px] text-[15px] font-semibold whitespace-nowrap hover:opacity-90"
          >
            {t("getStarted")}
            <ArrowUpRightIcon className="text-arrow" />
          </Link>
        </div>
        <p className="mt-3.5 text-[13px] font-normal text-white/60">{t("footnote")}</p>
      </Reveal>
    </section>
  );
}
