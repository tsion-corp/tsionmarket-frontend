import type { DiscoveryMarketSummary } from "../api";
import {
  discoveryMarketLabel,
  discoverySelection,
  type DiscoverySelection,
} from "../discovery-presenter";
import { DiscoveryOutcomeButton } from "./discovery-outcome-button";

interface DiscoveryMarketRowProps {
  market: DiscoveryMarketSummary;
  selectedIds: ReadonlySet<string>;
  onSelect: (selection: DiscoverySelection) => void;
}

export function DiscoveryMarketRow({ market, selectedIds, onSelect }: DiscoveryMarketRowProps) {
  const yes = market.outcomes.find((outcome) => outcome.name.toLowerCase() === "yes") ?? null;
  const no = market.outcomes.find((outcome) => outcome.name.toLowerCase() === "no") ?? null;
  const outcomes = yes || no ? [yes, no] : [market.outcomes[0] ?? null, market.outcomes[1] ?? null];

  return (
    <div className="pointer-events-none relative z-[1] grid min-w-0 grid-cols-[minmax(0,1fr)_150px] items-center gap-1.5 border-t border-white/7 py-2 first:border-t-0 sm:grid-cols-[minmax(0,1fr)_320px] sm:gap-2 sm:py-2.5">
      <div className="min-w-0 sm:pr-2">
        <p className="line-clamp-2 text-[11px] leading-[1.3] font-semibold text-white/78 sm:truncate sm:text-[12px]">
          {discoveryMarketLabel(market)}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
        {outcomes.map((outcome, index) => {
          const selection = outcome ? discoverySelection(market, outcome) : null;
          return (
            <DiscoveryOutcomeButton
              key={outcome?.name ?? `${market.id}-missing-outcome-${index}`}
              selection={selection}
              selected={selection ? selectedIds.has(selection.id) : false}
              onSelect={onSelect}
            />
          );
        })}
      </div>
    </div>
  );
}
