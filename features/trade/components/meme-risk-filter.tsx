"use client";

import { useTranslations } from "next-intl";
import type { MemeToken, TokenRiskLevel } from "@/lib/meme/api";

// The bands a coin can be filtered to. MEDIUM is here even though it was not
// asked for: the assessment returns five levels, and offering four would make
// every medium-risk coin unreachable the moment any filter is on — a filter
// that hides a whole band reads as a broken list, not a narrower one.
export const RISK_FILTERS: readonly TokenRiskLevel[] = [
  "UNKNOWN",
  "LOW",
  "MEDIUM",
  "HIGH",
  "CRITICAL",
];

export function filterByRisk(tokens: MemeToken[], active: Set<TokenRiskLevel>): MemeToken[] {
  if (active.size === 0) return tokens;
  return tokens.filter((t) => active.has(t.riskLevel));
}

interface RiskFilterProps {
  active: Set<TokenRiskLevel>;
  onToggle: (level: TokenRiskLevel) => void;
  onClear: () => void;
  counts: Map<TokenRiskLevel, number>;
}

// Chips rather than a select: the whole point is seeing what is on at a glance
// while the list moves underneath.
export function RiskFilter({ active, onToggle, onClear, counts }: RiskFilterProps) {
  const t = useTranslations("meme");
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={onClear}
        aria-pressed={active.size === 0}
        className={`cursor-pointer rounded-full border px-3 py-1.5 font-sans text-[12.5px] font-medium transition-colors ${
          active.size === 0
            ? "border-white/30 bg-white/10 text-white"
            : "border-white/10 text-white/55 hover:border-white/25 hover:text-white"
        }`}
      >
        {t("riskAll")}
      </button>
      {RISK_FILTERS.map((level) => {
        const on = active.has(level);
        const n = counts.get(level) ?? 0;
        return (
          <button
            key={level}
            type="button"
            onClick={() => onToggle(level)}
            aria-pressed={on}
            className={`cursor-pointer rounded-full border px-3 py-1.5 font-sans text-[12.5px] font-medium transition-colors ${
              on
                ? "border-white/30 bg-white/10 text-white"
                : "border-white/10 text-white/55 hover:border-white/25 hover:text-white"
            }`}
          >
            {t(`risk${level.charAt(0)}${level.slice(1).toLowerCase()}`)}
            {/* The count is the honest reason a chip is worth pressing, and it
                shows a band is empty before the press rather than after. */}
            <span className="tnum ml-1.5 text-white/40">{n}</span>
          </button>
        );
      })}
    </div>
  );
}
