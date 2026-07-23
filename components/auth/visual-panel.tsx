"use client";

import { motion } from "motion/react";

const STATS = [
  { value: "12,000+", label: "On the early list" },
  { value: "6", label: "Markets, one app" },
  { value: "100%", label: "Self-custody" },
];

export function VisualPanel() {
  return (
    <div className="relative m-3 ml-0 hidden overflow-hidden rounded-[28px] lg:block">
      <motion.video
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1.6, delay: 0.2 }}
        className="absolute inset-0 h-full w-full object-cover object-center"
      >
        <source src="/hero.mp4" type="video/mp4" />
      </motion.video>
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.45)_0%,rgba(0,0,0,0.1)_35%,rgba(0,0,0,0.25)_65%,rgba(0,0,0,0.85)_100%)]" />
      <div className="relative z-[2] flex h-full flex-col justify-end p-12">
        <div className="mb-[22px] inline-flex items-center gap-2 self-start rounded-full border border-white/16 bg-white/8 px-3.5 py-1.5 backdrop-blur-[10px]">
          <span className="bg-accent h-[7px] w-[7px] rounded-full" />
          <span className="text-[13px] text-white/90">The onchain superapp for global markets</span>
        </div>
        <h2 className="ws-serif max-w-[14ch] text-[clamp(40px,4.4vw,64px)] leading-[1.02] tracking-[-0.03em]">
          Own the world, <span className="text-accent">on your own terms</span>
        </h2>
        <div className="mt-8 flex flex-wrap gap-[26px]">
          {STATS.map((s) => (
            <div key={s.label}>
              <div className="ws-serif text-[34px] leading-none text-white">{s.value}</div>
              <div className="mt-0.5 text-[13px] text-white/65">{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
