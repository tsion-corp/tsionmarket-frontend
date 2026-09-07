"use client";

import { useTranslations } from "next-intl";
import { SearchIcon } from "@/components/ui/icons";

interface MemeSearchInputProps {
  value: string;
  onChange: (value: string) => void;
  /** Distinguishes the two inputs on the page for screen readers. */
  label: string;
}

// The search box for both memecoin lists. Full width of its row on a phone and
// wide on a desktop: a token name, a symbol and a contract address all go in
// here, and the last of those does not fit in a decorative field.
export function MemeSearchInput({ value, onChange, label }: MemeSearchInputProps) {
  const t = useTranslations("meme");
  return (
    <label className="relative block w-full sm:w-[360px] lg:w-[420px]">
      <span className="sr-only">{label}</span>
      <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-white/35">
        <SearchIcon size={16} />
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t("searchPlaceholder")}
        spellCheck={false}
        autoComplete="off"
        className="focus:border-accent/60 h-11 w-full rounded-[14px] border border-white/12 bg-white/4 pr-10 pl-11 font-sans text-[14px] font-normal text-white transition-colors outline-none placeholder:text-white/35 hover:border-white/20"
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label={t("clearSearch")}
          className="absolute top-1/2 right-3 grid size-6 -translate-y-1/2 cursor-pointer place-items-center rounded-full text-white/40 transition-colors hover:bg-white/10 hover:text-white"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M6 6l12 12M18 6L6 18"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>
      ) : null}
    </label>
  );
}
