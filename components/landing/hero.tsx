"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { ArrowUpRightIcon, ClockIcon, GlobeIcon } from "@/components/ui/icons";

const TICKER = ["Stocks", "Gold", "Treasuries", "Perps", "Predictions"];

function word(delay: number) {
  return {
    initial: { opacity: 0, y: 30, filter: "blur(8px)" },
    animate: { opacity: 1, y: 0, filter: "blur(0px)" },
    transition: { duration: 1.05, delay, ease: [0.2, 0.7, 0.2, 1] as const },
  };
}

export function Hero() {
  return (
    <header id="top" className="relative flex min-h-screen flex-col overflow-hidden">
      <motion.video
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1.6, delay: 0.2 }}
        className="absolute top-0 left-1/2 z-0 h-[120%] w-[120%] -translate-x-1/2 object-cover object-top"
      >
        <source src="/hero.mp4" type="video/mp4" />
      </motion.video>
      <div className="absolute inset-0 z-[1] bg-[linear-gradient(180deg,rgba(0,0,0,0.55)_0%,rgba(0,0,0,0.15)_30%,rgba(0,0,0,0.2)_60%,rgba(0,0,0,0.85)_100%)]" />

      <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 pt-[120px] pb-[30px] text-center">
        <motion.div
          {...word(0.05)}
          className="inline-flex items-center gap-2.5 rounded-full border border-white/14 bg-white/6 py-[5px] pr-4 pl-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)] backdrop-blur-[10px]"
        >
          <span className="text-ink rounded-full bg-white px-[11px] py-[3px] text-[11px] font-semibold">
            New
          </span>
          <span className="pr-1 text-[13.5px] font-normal text-white/90">
            The onchain superapp for global markets
          </span>
        </motion.div>

        <motion.h1
          {...word(0.2)}
          className="ws-serif mt-[30px] max-w-[min(94vw,1000px)] text-center text-[clamp(34px,8vw,112px)] leading-[1.08] tracking-[-0.015em] text-balance"
        >
          Own the <span className="text-accent">world,</span>
          <br className="hidden sm:block" /> on your own terms.
        </motion.h1>

        <motion.p
          {...word(0.7)}
          className="mt-[22px] max-w-[60ch] text-[clamp(15px,1.6vw,18px)] leading-[1.55] font-light text-white/92"
        >
          Buy stocks, gold and crypto, trade perps and predictions, and grow your money from one
          app. Fund in Naira, stay in full control, and reach global markets without a bank, a
          broker or a border.
        </motion.p>

        <motion.div
          {...word(0.85)}
          className="mt-[30px] flex flex-wrap items-center justify-center gap-[22px]"
        >
          <Link
            href="/auth"
            className="inline-flex items-center gap-2 rounded-full border border-white/16 bg-white/8 px-6 py-[13px] text-[15px] font-medium text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] backdrop-blur-[50px] hover:bg-white/12"
          >
            Get started
            <ArrowUpRightIcon size={18} className="text-accent" />
          </Link>
        </motion.div>

        <motion.div
          {...word(1)}
          className="mt-[38px] flex flex-wrap items-stretch justify-center gap-3.5"
        >
          <div className="ws-glass w-full max-w-[320px] rounded-[22px] p-5 text-left sm:w-[220px]">
            <ClockIcon className="text-white" />
            <div className="ws-serif mt-3.5 text-[38px] leading-none tracking-[-0.02em]">24/7</div>
            <div className="mt-2 text-xs font-normal text-white/80">Global market access</div>
          </div>
          <div className="ws-glass w-full max-w-[320px] rounded-[22px] p-5 text-left sm:w-[220px]">
            <GlobeIcon size={26} className="text-white" />
            <div className="ws-serif mt-3.5 text-[38px] leading-none tracking-[-0.02em]">
              6 markets
            </div>
            <div className="mt-2 text-xs font-normal text-white/80">All in one app</div>
          </div>
        </motion.div>
      </div>

      <motion.div
        {...word(1.1)}
        className="relative z-10 flex flex-col items-center gap-4 pb-[34px]"
      >
        <span className="rounded-full border border-white/12 bg-white/6 px-4 py-1.5 text-xs font-medium text-white/85 backdrop-blur-[10px]">
          Everything you can own, on open rails
        </span>
        <div className="hidden items-center gap-[clamp(28px,5vw,64px)] md:flex">
          {TICKER.map((t) => (
            <span key={t} className="ws-serif text-[clamp(20px,2.6vw,30px)] text-white/92">
              {t}
            </span>
          ))}
        </div>
      </motion.div>
    </header>
  );
}
