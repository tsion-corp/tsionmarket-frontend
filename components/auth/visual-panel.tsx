"use client";

import { AuroraHeroBackground } from "@/components/landing/aurora-hero-bg";

const STATS = [
  { value: "12,000+", label: "On the early list" },
  { value: "6", label: "Markets, one app" },
  { value: "100%", label: "Self-custody" },
];

export function VisualPanel() {
  return (
    <div className="relative m-3 ml-0 hidden overflow-hidden rounded-[28px] lg:block">
      <AuroraHeroBackground />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.45)_0%,rgba(0,0,0,0.1)_35%,rgba(0,0,0,0.25)_65%,rgba(0,0,0,0.85)_100%)]" />
      <div className="relative z-[2] flex h-full flex-col justify-end p-12">
        <h2 className="ws-display max-w-[14ch] text-[clamp(40px,4.4vw,64px)] leading-[1.02] tracking-[-0.03em]">
          Control your money, <span className="text-accent">and access global markets.</span>
        </h2>
        <div className="mt-8 flex flex-wrap gap-[26px]">
          {STATS.map((s) => (
            <div key={s.label}>
              <div className="ws-display text-[34px] leading-none text-white">{s.value}</div>
              <div className="mt-0.5 text-[13px] text-white/65">{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
