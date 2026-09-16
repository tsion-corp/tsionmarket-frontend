"use client";

import { fromBaseUnits } from "@/lib/trade/math";

// The 25 / 50 / 75 / Max row under the amount field on a ticket's SELL leg.
//
// Presentational, and deliberately so. It holds no balance query and no amount
// state: the parent owns both, and this row only turns a share of the holding
// it was handed into the decimal string the amount field already speaks.
//
// Every figure on this path is a base-unit bigint. A holding routinely runs
// past 2^53 base units (eighteen decimals against any real supply), so parsing
// one to a float would drop digits of the user's actual balance. Nothing here
// calls Number() on a holding, and nothing multiplies a parsed balance.
//
// The pills match the memecoin desk (meme-sell-panel.tsx) so the desks read the
// same way.

const SHORTCUTS = [25, 50, 75] as const;

const PILL =
  "bg-surface border-hairline cursor-pointer rounded-full border px-3 py-1 font-serif text-[11px] font-semibold text-white/70 hover:border-white/35 hover:text-white disabled:cursor-not-allowed disabled:opacity-40";

export interface TradeSellShortcutsLabels {
  /** Names the row, so a lone "25%" says what it is a share of. */
  group: string;
  /** The full-exit pill. */
  max: string;
}

export interface TradeSellShortcutsProps {
  /** The holding, in the asset's own base units. Null when it cannot be read. */
  held: bigint | null;
  decimals: number;
  /** Receives a decimal string, the same shape the amount field holds. */
  onSelect: (amount: string) => void;
  /**
   * Finished strings. This primitive reads no message catalogue, so the desk
   * that composes it supplies the wording.
   */
  labels: TradeSellShortcutsLabels;
  disabled?: boolean;
}

// Integer division on base units, never float arithmetic. A fraction floors to
// a whole base unit, so it can never come out above the balance.
function amountForPercent(held: bigint, percent: number, decimals: number): string {
  return fromBaseUnits((held * BigInt(percent)) / 100n, decimals);
}

// Max is its own path rather than amountForPercent(held, 100): a full exit must
// sell the exact holding, so the holding goes to the formatter untouched with
// no arithmetic in front of it that could ever leave a dust remainder behind.
function maxAmount(held: bigint, decimals: number): string {
  return fromBaseUnits(held, decimals);
}

export function TradeSellShortcuts({
  held,
  decimals,
  onSelect,
  labels,
  disabled = false,
}: TradeSellShortcutsProps): React.ReactElement {
  // A holding we cannot read, and an empty one, both leave nothing to take a
  // share of, so the whole row goes dead rather than emitting a zero amount.
  const unusable = disabled || held === null || held === 0n;

  function emit(amount: string) {
    if (unusable) return;
    onSelect(amount);
  }

  return (
    <div role="group" aria-label={labels.group} className="flex items-center gap-2">
      {SHORTCUTS.map((percent) => (
        <button
          key={percent}
          type="button"
          onClick={() => emit(amountForPercent(held ?? 0n, percent, decimals))}
          disabled={unusable}
          className={PILL}
        >
          {percent}%
        </button>
      ))}
      <button
        type="button"
        onClick={() => emit(maxAmount(held ?? 0n, decimals))}
        disabled={unusable}
        className={PILL}
      >
        {labels.max}
      </button>
    </div>
  );
}
