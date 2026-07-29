"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Wordmark } from "@/components/ui/wordmark";
import { Eyebrow } from "@/components/ui/eyebrow";
import { InterestCard } from "@/components/interests/interest-card";
import { ContinueBar } from "@/components/interests/continue-bar";
import { AuthGuard } from "@/components/auth/auth-guard";
import { INTERESTS } from "@/lib/data/interests";
import { clearInterest, loadInterest, saveInterest } from "@/lib/preferences";

// Restore a previously saved choice, ignoring keys that no longer exist.
function initialSelection(): string | null {
  const saved = loadInterest();
  return saved && INTERESTS.some((it) => it.key === saved) ? saved : null;
}

// Renders only after AuthGuard passes, so the initializer runs client-side
// and can read localStorage safely.
function InterestPicker() {
  const [selected, setSelected] = useState<string | null>(initialSelection);
  const router = useRouter();

  const toggle = (key: string) => setSelected((current) => (current === key ? null : key));

  const chosen = INTERESTS.find((it) => it.key === selected) ?? null;

  const handleContinue = () => {
    if (!selected) return;
    saveInterest(selected);
    router.push("/dashboard");
  };

  return (
    <div className="bg-[radial-gradient(120%_80%_at_50%_-10%,rgba(255, 255, 255, 0.14)_0%,rgba(0,0,0,0)_55%),#000] flex min-h-screen flex-col">
      <header className="mx-auto flex w-full max-w-[1120px] items-center justify-between px-6 py-[22px] sm:px-8">
        <Wordmark />
        <div className="flex items-center gap-3.5">
          <div className="flex items-center gap-2">
            <span className="bg-accent h-1 w-[26px] rounded-full" />
            <span className="h-1 w-[26px] rounded-full bg-white/16" />
          </div>
          <span className="text-[13px] font-normal text-white/55">Step 1 of 2</span>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-[1200px] flex-1 flex-col items-center justify-center px-6 pt-6 pb-[140px]">
        <div className="max-w-[20ch] text-center">
          <Eyebrow>Tailor your app</Eyebrow>
          <h1 className="ws-display mt-3 text-[clamp(34px,5vw,60px)] leading-[1.02] tracking-[-0.03em]">
            What are you here to <span className="text-accent">own?</span>
          </h1>
        </div>
        <p className="mt-4 max-w-[52ch] text-center text-base leading-[1.55] text-white/72">
          Pick one thing to start with. We&apos;ll shape your dashboard, watchlists and alerts
          around it. You can change it anytime.
        </p>

        <div
          role="radiogroup"
          aria-label="Choose an interest"
          className="mt-8 grid w-full grid-cols-1 gap-2.5 min-[430px]:grid-cols-2 sm:mt-11 sm:gap-3.5 lg:grid-cols-4"
        >
          {INTERESTS.map((it) => (
            <InterestCard
              key={it.key}
              interest={it}
              selected={selected === it.key}
              onToggle={() => toggle(it.key)}
            />
          ))}
        </div>
      </div>

      <ContinueBar
        selectedTitle={chosen?.title ?? null}
        onContinue={handleContinue}
        onSkip={clearInterest}
      />
    </div>
  );
}

export default function InterestsPage() {
  return (
    <AuthGuard>
      <InterestPicker />
    </AuthGuard>
  );
}
