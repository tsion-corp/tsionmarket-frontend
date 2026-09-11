"use client";

import { useTranslations } from "next-intl";
import { SUPPORT_EMAIL } from "@/lib/brand";

// Support requests go to the support inbox until the real chat support
// ships; this floating button is its stand-in and keeps the same spot chat
// will take over.

// The classic bottom-right floating support entry. On a phone it sits above
// the floating tab bar; under every overlay (modals, drawers) so it never
// covers a flow. The mascot is rendered grayscale so it sits inside the
// platform's monochrome look.
export function SupportButton() {
  const t = useTranslations("topbar");

  return (
    <a
      href={`mailto:${SUPPORT_EMAIL}`}
      className="group fixed right-4 bottom-[calc(92px+env(safe-area-inset-bottom))] z-[80] flex flex-col items-center gap-1 md:right-6 md:bottom-6"
    >
      <span className="ws-glass grid size-[52px] place-items-center rounded-full shadow-[0_14px_40px_-12px_rgba(0,0,0,0.85)] transition-transform group-hover:scale-105">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/support.png" alt="" width={36} height={36} className="h-9 w-9 grayscale" />
      </span>
      <span className="text-[11px] font-medium text-white/60 transition-colors group-hover:text-white/85">
        {t("support")}
      </span>
    </a>
  );
}
