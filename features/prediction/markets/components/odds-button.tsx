import type { BoardSelection } from "../presenter";

interface OddsButtonProps {
  selection: BoardSelection | null;
  selected: boolean;
  onSelect: (selection: BoardSelection) => void;
  compact?: boolean;
}

export function OddsButton({ selection, selected, onSelect, compact = false }: OddsButtonProps) {
  if (!selection) {
    return (
      <span
        className={`flex items-center justify-center border border-white/5 bg-white/[0.025] text-white/25 ${
          compact ? "h-[46px] rounded-[4px] text-[11px]" : "h-11 rounded-[7px] text-[12px]"
        }`}
      >
        -
      </span>
    );
  }

  return (
    <button
      type="button"
      aria-label={`${selection.label} at ${selection.decimalOdds.toFixed(2)}`}
      aria-pressed={selected}
      onClick={() => onSelect(selection)}
      className={`flex min-w-0 cursor-pointer items-center justify-center overflow-hidden border px-1 text-center transition-[border-color,background-color,transform] active:scale-[0.98] ${
        compact ? "h-[46px] rounded-[4px]" : "h-11 rounded-[7px]"
      } ${
        selected
          ? "border-white/45 bg-[linear-gradient(180deg,#d9d9dc_0%,#a8a8ae_100%)] text-black"
          : compact
            ? "border-white/[0.07] bg-[#292b31] text-white hover:border-white/20 hover:bg-[#34363d]"
            : "border-white/9 bg-[#202024] text-white hover:border-white/20 hover:bg-[#29292e]"
      }`}
    >
      <span
        className={`max-w-full truncate font-extrabold tabular-nums ${compact ? "text-[12px]" : "text-[13px]"}`}
      >
        {selection.decimalOdds.toFixed(2)}
      </span>
    </button>
  );
}
