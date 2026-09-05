import type { DiscoverySelection } from "../discovery-presenter";

interface DiscoveryOutcomeButtonProps {
  selection: DiscoverySelection | null;
  selected: boolean;
  onSelect: (selection: DiscoverySelection) => void;
}

export function DiscoveryOutcomeButton({
  selection,
  selected,
  onSelect,
}: DiscoveryOutcomeButtonProps) {
  if (!selection) {
    return (
      <span className="flex h-10 items-center justify-center rounded-[5px] border border-white/5 bg-white/[0.025] text-[11px] text-white/25 sm:rounded-[8px]">
        -
      </span>
    );
  }

  const negative = selection.outcome.toLowerCase() === "no";

  return (
    <button
      type="button"
      aria-label={`Buy ${selection.outcome} at ${selection.decimalOdds.toFixed(2)}`}
      aria-pressed={selected}
      onClick={() => onSelect(selection)}
      className={`pointer-events-auto relative z-10 flex h-10 min-w-0 cursor-pointer items-center justify-center overflow-hidden rounded-[5px] border px-2 transition-[border-color,background-color,transform] active:scale-[0.98] sm:rounded-[8px] sm:px-2.5 ${
        selected
          ? negative
            ? "border-[#ff6872] bg-[#ff6872] text-[#1b0508]"
            : "border-[#55e28a] bg-[#55e28a] text-[#06130b]"
          : negative
            ? "border-[#ff6670]/12 bg-[#37262c] text-[#ff7079] hover:border-[#ff7079]/35 hover:bg-[#402a30]"
            : "border-[#48df79]/12 bg-[#26342d] text-[#48df79] hover:border-[#48df79]/35 hover:bg-[#2b3d33]"
      }`}
    >
      <span className="shrink-0 text-[12px] font-black tabular-nums">
        {selection.decimalOdds.toFixed(2)}
      </span>
    </button>
  );
}
