"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { BRAND } from "@/lib/brand";

const FAQ_KEYS = [
  { q: "q1", a: "a1" },
  { q: "q2", a: "a2" },
  { q: "q3", a: "a3" },
  { q: "q4", a: "a4" },
  { q: "q5", a: "a5" },
] as const;

// Single-open accordion for the FAQ copy layer. The answer animates with the
// grid-template-rows 0fr/1fr trick so no content height is ever hardcoded.
export function FaqAccordion() {
  const t = useTranslations("landing.faq");
  const [openIndex, setOpenIndex] = useState(0);
  return (
    <div className="flex flex-col gap-2.5">
      {FAQ_KEYS.map((f, i) => {
        const open = openIndex === i;
        return (
          <div
            key={f.q}
            className="rounded-2xl border border-white/18 bg-[rgba(16,16,18,0.62)] px-[22px] shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_18px_50px_-20px_rgba(0,0,0,0.9)] backdrop-blur-[14px]"
          >
            <button
              type="button"
              aria-expanded={open}
              onClick={() => setOpenIndex(open ? -1 : i)}
              className="flex w-full cursor-pointer items-center justify-between gap-4 py-4 text-left text-[16.5px] font-medium"
            >
              {t(f.q, { brand: BRAND })}
              <span
                className={`shrink-0 text-[22px] leading-none text-[#d4d4d8] transition-transform duration-200 ${open ? "rotate-45" : ""}`}
              >
                +
              </span>
            </button>
            <div
              className={`grid transition-[grid-template-rows,opacity] duration-[350ms] ease-[cubic-bezier(.2,.7,.2,1)] ${
                open ? "[grid-template-rows:1fr] opacity-100" : "[grid-template-rows:0fr] opacity-0"
              }`}
            >
              <div className="overflow-hidden">
                <p className="pb-[18px] text-[15px] leading-[1.6] font-light text-[rgba(244,244,244,0.8)]">
                  {t(f.a)}
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
