import type { EventOutcomeView } from "../event-detail-presenter";

interface EventOutcomeButtonProps {
  outcome: EventOutcomeView;
  selected: boolean;
  onSelect: (outcome: EventOutcomeView) => void;
}

export function EventOutcomeButton({ outcome, selected, onSelect }: EventOutcomeButtonProps) {
  const { selection, executable } = outcome;

  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={!executable}
      onClick={() => onSelect(outcome)}
      className={`flex min-h-12 min-w-0 items-center justify-between gap-3 overflow-hidden rounded-[8px] border px-3 text-left transition-[border-color,background-color,transform] enabled:cursor-pointer enabled:active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-35 ${
        selected
          ? "border-white/50 bg-[linear-gradient(180deg,#dedee2_0%,#aaaab0_100%)] text-black"
          : "border-white/9 bg-[#202024] text-white hover:border-white/20 hover:bg-[#29292e]"
      }`}
    >
      <span className="min-w-0 truncate text-[12px] font-semibold">{selection.label}</span>
      <span className="shrink-0 text-[13px] font-extrabold tabular-nums">
        {selection.decimalOdds.toFixed(2)}
      </span>
    </button>
  );
}
