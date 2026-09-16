"use client";

export type HoldingsView = "coins" | "memecoins";

const VIEWS: readonly HoldingsView[] = ["coins", "memecoins"];

interface HoldingsViewSwitchProps {
  view: HoldingsView;
  onChange: (view: HoldingsView) => void;
  /** Finished strings, bound by the sheet that owns the switch. */
  labels: { group: string; coins: string; memecoins: string };
  /** The id of the panel both tabs control. */
  panelId: string;
  /** Prefix for each tab's id, so the panel can name the one selected. */
  tabIdPrefix: string;
}

/**
 * The two halves of the holdings sheet: the wallet's coins, and the memecoins
 * bought through the trade service with their profit and loss. Drawn as the
 * Kash history sheet draws its tabs, so the sheets read as one family.
 */
export function HoldingsViewSwitch({
  view,
  onChange,
  labels,
  panelId,
  tabIdPrefix,
}: HoldingsViewSwitchProps) {
  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const next = view === "coins" ? "memecoins" : "coins";
    onChange(next);
    document.getElementById(`${tabIdPrefix}-${next}`)?.focus();
  };

  return (
    <div role="tablist" aria-label={labels.group} className="flex gap-1">
      {VIEWS.map((id) => {
        const selected = view === id;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            id={`${tabIdPrefix}-${id}`}
            aria-selected={selected}
            aria-controls={panelId}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(id)}
            onKeyDown={onKeyDown}
            className={`cursor-pointer rounded-full px-3 py-1.5 text-[12.5px] font-medium transition-colors ${
              selected ? "bg-white/12 text-white/90" : "text-white/45 hover:text-white/70"
            }`}
          >
            {labels[id]}
          </button>
        );
      })}
    </div>
  );
}
