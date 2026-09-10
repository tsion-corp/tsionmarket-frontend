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

interface LanguageSelectProps {
  /**
   * "chrome" is the taller, darker pill the Market design puts in the desktop
   * topbar. Everywhere else (landing, waitlist, account modal) keeps the
   * compact default, so this stays opt-in rather than a change to all four.
   */
  variant?: "compact" | "chrome";
}

// The visible language switcher, compact enough for the mobile topbar: a globe
// with the current code, opening a menu of native-language names. Picking one
// writes the NEXT_LOCALE cookie and refreshes, so the server re-renders every
// translation in place. No URLs change.
export function LanguageSelect({ variant = "compact" }: LanguageSelectProps = {}) {
  const active = useLocale();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const rootRef = useRef<HTMLDivElement>(null);
  const chrome = variant === "chrome";

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
        className={`ws-pressable flex cursor-pointer items-center rounded-full border border-white/12 ${
          chrome
            ? "h-[46px] gap-[3.62px] bg-black/[0.19] pr-[14.5px] pl-[21px] font-serif text-[14px] leading-[14.3px] font-medium text-white"
            : "gap-1.5 bg-white/6 px-2.5 py-2 text-[12.5px] font-medium text-white/80 min-[400px]:px-3"
        } ${pending ? "opacity-60" : ""}`}
      >
        {chrome ? (
          <>
            {/* The Market head's own globe and chevron, exported from the design
                file. Both are fixed-colour glyphs, so they sit in explicitly
                sized boxes rather than inheriting the button's text colour. */}
            <span className="flex items-center gap-[5.43px]">
              <img
                src="/market/topbar-icon-globe.svg"
                alt=""
                width={15}
                height={15}
                className="block size-[14.26px] shrink-0"
              />
              <span className="uppercase">{active}</span>
            </span>
            <span
              className={`grid size-[21.72px] shrink-0 place-items-center transition-transform duration-150 ${
                open ? "rotate-180" : ""
              }`}
            >
              <img
                src="/market/topbar-icon-chevron.svg"
                alt=""
                width={12}
                height={7}
                className="block h-[6.79px] w-[12.22px]"
              />
            </span>
          </>
        ) : (
          <>
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
          </>
        )}
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
