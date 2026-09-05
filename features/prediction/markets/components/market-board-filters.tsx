import type { MarketWindow } from "../presenter";

interface MarketBoardFiltersProps {
  window: MarketWindow;
  onWindowChange: (window: MarketWindow) => void;
}

export function MarketBoardFilters({ window, onWindowChange }: MarketBoardFiltersProps) {
  const options: Array<{ value: MarketWindow; compact: string; label: string }> = [
    { value: "today", compact: "Today", label: "Today Games" },
    { value: "next-24h", compact: "24h", label: "Next 24h" },
    { value: "upcoming", compact: "Later", label: "Upcoming Games" },
  ];

  return (
    <div className="flex items-center gap-2 border-b border-white/8 bg-[#0d0d0f] px-3 py-2.5 sm:gap-3 sm:px-4 sm:py-3">
      <div className="flex shrink-0 rounded-[9px] border border-white/9 bg-black p-1">
        {options.map(({ value, compact, label }) => (
          <button
            key={value}
            type="button"
            onClick={() => onWindowChange(value)}
            className={`h-8 cursor-pointer rounded-[7px] px-2.5 text-[10px] font-bold transition-colors sm:px-3 sm:text-[11px] ${
              window === value
                ? "bg-[#b9b9bf] text-black"
                : "text-white/45 hover:bg-white/5 hover:text-white/75"
            }`}
          >
            <span className="sm:hidden">{compact}</span>
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>
      <p className="ml-auto truncate text-[10px] font-semibold tracking-[0.08em] text-white/35 uppercase sm:text-[11px]">
        Moneyline · spreads · totals
      </p>
    </div>
  );
}
