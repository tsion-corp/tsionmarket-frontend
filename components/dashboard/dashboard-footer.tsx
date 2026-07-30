"use client";

import { useTranslations } from "next-intl";
import { TsionMark } from "@/components/ui/tsion-mark";

interface DashboardFooterProps {
  // The dashboard nav sections, used for quick links.
  sections: { id: string; label: string }[];
  // Scrolls in-page on /dashboard, or navigates there first from any other
  // page (e.g. /casino) — same dispatcher the sidebar and topbar use.
  onSelect: (id: string) => void;
}

// Footer for the authenticated dashboard. The copy stays honest about the
// self-custody, at-your-own-risk nature of the app.
export function DashboardFooter({ sections, onSelect }: DashboardFooterProps) {
  const t = useTranslations("dashFooter");
  const year = new Date().getFullYear();

  return (
    <footer className="mt-8 border-t border-white/8 bg-black px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-[1520px] flex-col gap-8">
        <div className="flex flex-col justify-between gap-6 md:flex-row md:items-start">
          <div className="max-w-[34ch]">
            <div className="flex items-center gap-2">
              <TsionMark size={30} />
              <span className="ws-display text-[17px]">TSION</span>
            </div>
            <p className="mt-3 text-[13px] leading-[1.6] font-normal text-white/55">
              {t("tagline")}
            </p>
          </div>

          <nav className="flex flex-wrap gap-x-6 gap-y-2.5">
            {sections.map((s) => (
              <button
                key={s.id}
                onClick={() => onSelect(s.id)}
                className="hover:text-accent cursor-pointer text-[13.5px] font-normal text-white/60"
              >
                {s.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/6 pt-6">
          <span className="text-[13px] font-normal text-white/40">
            {t("rights", { year, brand: "TSION" })}
          </span>
          <span className="max-w-[62ch] text-xs font-normal text-white/35">{t("disclaimer")}</span>
        </div>
      </div>
    </footer>
  );
}
