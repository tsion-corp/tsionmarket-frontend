"use client";

import { useTranslations } from "next-intl";

// The preset pay amounts under the spot ticket's amount card. Each chip sets
// the amount to its own value, exactly as written: the values are decimal
// strings, so nothing is parsed on the way through.

// The design's chip row is $10, $20, $50, $100, $100, $200 (Figma nodes
// 173:42208 through 173:42213). The fifth chip repeats the fourth, which is a
// defect in the file rather than a second $100 button, so the default set
// carries five distinct amounts.
export const SPOT_QUICK_AMOUNTS = ["10", "20", "50", "100", "200"] as const;

export interface SpotQuickAmountsProps {
  // Decimal strings, no currency symbol and no grouping. A repeated value
  // renders once.
  values: readonly string[];
  // Called with the chip's value, unchanged.
  onSelect: (value: string) => void;
  // The value currently in the amount field, when it matches a chip.
  selected?: string | null;
  // Set while an order is in flight.
  disabled?: boolean;
  // Sits in front of each chip's number. The chips are dollar presets.
  prefix?: string;
}

export function SpotQuickAmounts({
  values,
  onSelect,
  selected = null,
  disabled = false,
  prefix = "$",
}: SpotQuickAmountsProps) {
  const t = useTranslations("spot");
  const distinct = Array.from(new Set(values));

  return (
    <div className="flex w-full flex-wrap items-center gap-[11px]">
      {distinct.map((value) => {
        const label = `${prefix}${value}`;
        return (
          <button
            key={value}
            type="button"
            onClick={() => onSelect(value)}
            disabled={disabled}
            aria-pressed={value === selected}
            aria-label={t("quickAmountLabel", { amount: label })}
            // The leading is set rather than left at the Tailwind default of
            // 1.5: at 17px that is a 25.5px line box and a 47.5px chip against
            // the design's 43.6px, and the row wraps, so the panel pays it
            // twice. 21.6px is the design's own line box. The height still
            // comes from the content, so a longer label in another locale
            // grows the chip instead of being cut.
            className={`flex items-center justify-center rounded-[50px] px-[22px] py-[11px] text-[17px] leading-[21.6px] font-semibold tracking-[-0.17px] text-white transition-colors disabled:opacity-50 ${
              value === selected ? "bg-surface-strong" : "bg-surface hover:bg-surface-strong"
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
