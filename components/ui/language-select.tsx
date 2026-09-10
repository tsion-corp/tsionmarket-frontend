"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { GlobeIcon, CheckIcon } from "@/components/ui/icons";
import { LOCALES, LOCALE_COOKIE, LOCALE_LABEL, isLocale, type Locale } from "@/lib/i18n";

// A year, so the choice outlives the session. Not httpOnly by design: the
// server reads it for rendering, and nothing secret lives in it.
function writeLocaleCookie(locale: Locale) {
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; samesite=lax`;
}

// The visible language switcher, compact enough for the mobile topbar: a globe
// with the current code, opening a menu of native-language names. Picking one
// writes the NEXT_LOCALE cookie and refreshes, so the server re-renders every
// translation in place. No URLs change.
export function LanguageSelect() {
  const active = useLocale();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const select = (locale: Locale) => {
    setOpen(false);
    if (locale === active) return;
    writeLocaleCookie(locale);
    startTransition(() => router.refresh());
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={isLocale(active) ? LOCALE_LABEL[active] : "Language"}
        className={`flex cursor-pointer items-center gap-1.5 rounded-full border border-white/12 bg-white/6 px-2.5 py-2 text-[12.5px] font-medium text-white/80 transition-colors hover:bg-white/10 hover:text-white min-[400px]:px-3 ${
          pending ? "opacity-60" : ""
        }`}
      >
        <GlobeIcon size={15} />
        <span className="uppercase">{active}</span>
        {/* Dropdown affordance, matching the currency selector's chevron.
            Rotates while open so the state reads at a glance. */}
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden
          className={`transition-transform duration-150 ${open ? "rotate-180" : ""}`}
        >
          <path
            d="m6 9 6 6 6-6"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-white/45"
          />
        </svg>
      </button>

      {open ? (
        <div
          role="listbox"
          className="bg-panel absolute right-0 z-[80] mt-2 w-[168px] rounded-xl border border-white/12 p-1.5 shadow-[0_24px_60px_-24px_rgba(0,0,0,0.9)]"
        >
          {LOCALES.map((locale) => {
            const on = locale === active;
            return (
              <button
                key={locale}
                role="option"
                aria-selected={on}
                onClick={() => select(locale)}
                className="flex w-full cursor-pointer items-center gap-2.5 rounded-[10px] px-3 py-2 text-left text-[13.5px] font-medium text-white/85 hover:bg-white/6"
              >
                <span className="flex-1">{LOCALE_LABEL[locale]}</span>
                {on ? (
                  <span className="text-accent">
                    <CheckIcon size={15} />
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
