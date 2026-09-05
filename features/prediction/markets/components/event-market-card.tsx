import type { EventMarketCardView, EventOutcomeView } from "../event-detail-presenter";
import { EventOutcomeButton } from "./event-outcome-button";

interface EventMarketCardProps {
  card: EventMarketCardView;
  selectedId: string | null;
  onSelect: (outcome: EventOutcomeView) => void;
}

function lineLabel(line: number): string {
  return line.toFixed(2).replace(/\.?0+$/, "");
}

export function EventMarketCard({ card, selectedId, onSelect }: EventMarketCardProps) {
  return (
    <article className="rounded-[10px] border border-white/8 bg-[#111114] p-3 sm:p-4">
      <header className="mb-3 flex min-w-0 items-center gap-2">
        <h3 className="truncate text-[13px] font-bold text-white/82">{card.title}</h3>
        {card.line != null ? (
          <span className="shrink-0 rounded-[5px] border border-white/10 bg-white/[0.055] px-2 py-1 text-[10px] font-extrabold text-white/55 tabular-nums">
            {lineLabel(card.line)}
          </span>
        ) : null}
      </header>
      <div className={`grid gap-2 ${card.outcomes.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
        {card.outcomes.map((outcome) => (
          <EventOutcomeButton
            key={outcome.selection.id}
            outcome={outcome}
            selected={outcome.selection.id === selectedId}
            onSelect={onSelect}
          />
        ))}
      </div>
    </article>
  );
}
