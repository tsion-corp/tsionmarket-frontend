"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Wordmark } from "@/components/ui/wordmark";
import { InterestCard } from "@/components/interests/interest-card";
import { ContinueBar } from "@/components/interests/continue-bar";
import { DEFAULT_SELECTED, INTERESTS } from "@/lib/data/interests";

export default function InterestsPage() {
  const [selected, setSelected] = useState<Record<string, boolean>>(DEFAULT_SELECTED);
  const router = useRouter();
  const count = Object.values(selected).filter(Boolean).length;

  const toggle = (key: string) => setSelected((s) => ({ ...s, [key]: !s[key] }));

  return (
    <div className="flex min-h-screen flex-col bg-[radial-gradient(120%_80%_at_50%_-10%,rgba(167,139,250,0.14)_0%,rgba(0,0,0,0)_55%),#000]">
      <header className="mx-auto flex w-full max-w-[1120px] items-center justify-between px-6 py-[22px] sm:px-8">
        <Wordmark />
        <div className="flex items-center gap-3.5">
          <div className="flex items-center gap-2">
            <span className="bg-accent h-1 w-[26px] rounded-full" />
            <span className="h-1 w-[26px] rounded-full bg-white/16" />
          </div>
          <span className="text-[13px] text-white/55">Step 1 of 2</span>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-[1000px] flex-1 flex-col items-center px-6 pt-5 pb-[140px]">
        <div className="max-w-[24ch] text-center">
          <div className="text-sm font-normal text-white/60">{"// Tailor your app"}</div>
          <h1 className="ws-serif mt-3 text-[clamp(38px,6vw,72px)] leading-[0.98] tracking-[-0.03em]">
            What are you here to <span className="text-accent">own?</span>
          </h1>
        </div>
        <p className="mt-4 max-w-[52ch] text-center text-base leading-[1.55] text-white/72">
          Pick what interests you. We&apos;ll shape your dashboard, watchlists and alerts around it.
          You can change this anytime.
        </p>

        <div className="mt-8 grid w-full grid-cols-1 gap-2.5 min-[430px]:grid-cols-2 sm:mt-11 sm:gap-3.5 lg:grid-cols-4">
          {INTERESTS.map((it) => (
            <InterestCard
              key={it.key}
              interest={it}
              selected={!!selected[it.key]}
              onToggle={() => toggle(it.key)}
            />
          ))}
        </div>
      </div>

      <ContinueBar count={count} onContinue={() => count > 0 && router.push("/dashboard")} />
    </div>
  );
}
