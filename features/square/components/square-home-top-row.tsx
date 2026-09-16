"use client";

import { useTranslations } from "next-intl";
import { squareLinks } from "@/lib/square/links";
import { IconTopSearch } from "@/features/square/components/square-home-icons";
import { SquareOutboundLink } from "@/features/square/components/square-outbound-link";

/**
 * Home's top row, the Square's own search field carried over
 * (market-square-frontend/components/layout/home-top-row.tsx): the 48px
 * pill with the search glyph, the placeholder's own words, and Clear once
 * something is typed. The page owns the words, as Home does, and while they
 * are there the sections give way to the results.
 *
 * The trailing seat, where Home keeps its Explore settings, carries the way
 * in to the whole Square instead: those settings (location, the people
 * filter) act on the Square's session, not this one.
 */
export function SquareHomeTopRow({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const t = useTranslations("square");

  return (
    <div className="mb-[18px] flex h-12 items-center gap-3">
      <div
        role="search"
        className="flex h-12 min-w-0 flex-1 items-center gap-[3.78px] rounded-full border-[0.68px] border-white/40 px-2 shadow-[0_5.45px_6.81px_-4.09px_rgba(0,0,0,0.1),0_13.62px_17.02px_-3.4px_rgba(0,0,0,0.1)] transition-colors focus-within:border-white/55"
      >
        <IconTopSearch className="h-4 w-4 shrink-0 text-[#6D6D6D]" />
        <input
          type="search"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-label={t("searchLabel")}
          placeholder={t("searchPlaceholder")}
          className="min-w-0 flex-1 bg-transparent text-[16px] leading-[22px] font-medium tracking-[-0.112px] text-white outline-none placeholder:text-[#7A7A7A] [&::-webkit-search-cancel-button]:appearance-none"
        />
        {value.length > 0 ? (
          <button
            type="button"
            onClick={() => onChange("")}
            aria-label={t("searchClear")}
            className="ws-pressable text-grey-500 shrink-0 rounded-full px-2 text-[13px] hover:text-white"
          >
            {t("searchClear")}
          </button>
        ) : null}
      </div>

      <SquareOutboundLink
        href={squareLinks.home()}
        label={t("openSquare")}
        variant="quiet"
        className="h-12 rounded-[36px] px-4 text-[11px]"
      />
    </div>
  );
}
