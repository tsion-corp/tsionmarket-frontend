"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { useTranslations } from "next-intl";
import { WaveGridBackground } from "@/components/landing/wave-grid-background";
import { ArrowUpRightIcon, ClockIcon, GlobeIcon } from "@/components/ui/icons";

const TICKER_KEYS = ["stocks", "gold", "treasuries", "trading", "predictions"] as const;

function word(delay: number) {
  return {
    initial: { opacity: 0, y: 30, filter: "blur(8px)" },
    animate: { opacity: 1, y: 0, filter: "blur(0px)" },
    transition: { duration: 1.05, delay, ease: [0.2, 0.7, 0.2, 1] as const },
  };
}

export function Hero() {
  const t = useTranslations("hero");
  return (
    <header id="top" className="relative flex min-h-screen flex-col overflow-hidden">
      <div className="absolute inset-0 z-0">
        <WaveGridBackground className="h-full w-full" />
      </div>
      <div className="absolute inset-0 z-[1] bg-[linear-gradient(180deg,rgba(0,0,0,0.5)_0%,rgba(0,0,0,0.12)_32%,rgba(0,0,0,0.2)_60%,rgba(0,0,0,0.86)_100%)]" />

      <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 pt-[120px] pb-[30px] text-center">
        <motion.h1
          {...word(0.05)}
          className="ws-display mt-[30px] max-w-[min(94vw,1000px)] text-center text-[clamp(46px,9.2vw,92px)] leading-[1.06] tracking-[-0.015em] text-balance"
        >
          {t.rich("title", {
            accent: (chunks) => <span className="text-accent">{chunks}</span>,
            break: () => <br className="hidden sm:block" />,
          })}
        </motion.h1>

        <motion.p
          {...word(0.7)}
          className="mt-[22px] max-w-[60ch] text-[clamp(15px,1.6vw,18px)] leading-[1.55] font-light text-white/92"
        >
          {t("subtitle")}
        </motion.p>

        <motion.div
          {...word(0.85)}
          className="mt-[30px] flex flex-wrap items-center justify-center gap-[22px]"
        >
          <Link
            href="/auth"
            className="inline-flex items-center gap-2 rounded-full border border-white/16 bg-white/8 px-6 py-[13px] text-[15px] font-medium text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] backdrop-blur-[50px] hover:bg-white/12"
          >
            {t("getStarted")}
            <ArrowUpRightIcon size={18} className="text-accent" />
          </Link>
        </motion.div>

        <motion.div
          {...word(1)}
          className="mt-[38px] flex flex-wrap items-stretch justify-center gap-3.5"
        >
          <div className="ws-glass w-full max-w-[320px] rounded-[22px] p-5 text-left sm:w-[220px]">
            <ClockIcon className="text-white" />
            <div className="ws-display mt-3.5 text-[38px] leading-none tracking-[-0.02em]">
              24/7
            </div>
            <div className="mt-2 text-xs font-normal text-white/80">{t("cardHoursLabel")}</div>
          </div>
          <div className="ws-glass w-full max-w-[320px] rounded-[22px] p-5 text-left sm:w-[220px]">
            <GlobeIcon size={26} className="text-white" />
            <div className="ws-display mt-3.5 text-[34px] leading-[1.05] tracking-[-0.02em]">
              {t.rich("cardMarketsTitle", { break: () => <br /> })}
            </div>
            <div className="mt-2 text-xs font-normal text-white/80">{t("cardMarketsLabel")}</div>
          </div>
        </motion.div>
      </div>

      <motion.div
        {...word(1.1)}
        className="relative z-10 flex flex-col items-center gap-4 pb-[34px]"
      >
        <div className="hidden items-center gap-[clamp(28px,5vw,64px)] md:flex">
          {TICKER_KEYS.map((k) => (
            <span key={k} className="ws-display text-[clamp(20px,2.6vw,30px)] text-white/92">
              {t(`ticker.${k}`)}
            </span>
          ))}
        </div>
      </motion.div>
    </header>
  );
}
