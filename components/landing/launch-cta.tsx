"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { MarketLogo } from "@/components/ui/market-logo";
import { BRAND } from "@/lib/brand";
import { isAppLive } from "@/lib/launch-gate";

interface LaunchCtaProps {
  className?: string;
  children: React.ReactNode;
}

// Every landing CTA that enters the app renders through this. Live, it is the
// plain /auth link it always was; with the app closed (see lib/launch-gate.ts)
// the same button opens a coming-soon notice instead, so the page keeps its
// energy while the doors are closed. The film only renders once the gate is
// open, so in practice this is the takedown switch's backstop.
export function LaunchCta({ className, children }: LaunchCtaProps) {
  const [open, setOpen] = useState(false);

  if (isAppLive()) {
    return (
      <Link href="/auth" className={className}>
        {children}
      </Link>
    );
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        {children}
      </button>
      {open ? <ComingSoonOverlay onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function ComingSoonOverlay({ onClose }: { onClose: () => void }) {
  const t = useTranslations("launchGate");

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      className="fixed inset-0 z-[300] grid place-items-center p-5"
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-[6px]" />
      <div
        onClick={(event) => event.stopPropagation()}
        className="relative w-full max-w-[380px] rounded-[22px] border border-white/14 bg-[rgba(16,16,18,0.94)] p-7 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_30px_80px_-20px_rgba(0,0,0,0.9)]"
      >
        <MarketLogo className="mx-auto w-[150px]" />
        <div className="ws-display mt-5 text-[24px] tracking-[-0.01em] text-white">
          {t("title")}
        </div>
        <p className="mx-auto mt-2 max-w-[30ch] text-[13.5px] leading-[1.6] font-normal text-white/60">
          {t("body", { brand: BRAND })}
        </p>
        <button
          type="button"
          onClick={onClose}
          className="mt-6 w-full cursor-pointer rounded-full bg-white py-3 text-[14px] font-semibold text-[#0a0a0a] hover:opacity-90"
        >
          {t("close")}
        </button>
      </div>
    </div>
  );
}
