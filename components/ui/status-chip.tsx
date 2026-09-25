import { cn } from "@/lib/utils";

/**
 * What a status means, not what it is called.
 *
 * The vocabulary is deliberately smaller than any one screen's label set. Six
 * status chips were hand rolled across the tree before this one, and every one
 * of them keyed its colours off its own feature's status strings, which is why
 * none of them could be reused. A tone is the only thing two features can agree
 * on, so the tone is what this primitive takes.
 *
 * - `win` for money coming back: won, earned, paid.
 * - `loss` for money not coming back: lost, failed, reverted.
 * - `live` for something happening right now. It draws a pulsing dot.
 * - `pending` for something that has not resolved yet: processing, in review,
 *   awaiting results.
 * - `done` for a neutral finish with no winner or loser: completed, settled.
 * - `neutral` for everything else, including a status the caller cannot map.
 */
export type StatusTone = "win" | "loss" | "live" | "pending" | "done" | "neutral";

// Border, wash, text. Geometry is shared; only the palette varies. The up and
// down tokens are the same pair the portfolio and memecoin rows already use for
// a gain and a loss, so a status reads the same colour as the number beside it.
const TONE_STYLE: Record<StatusTone, string> = {
  win: "border-up/35 bg-up/12 text-up",
  loss: "border-down/35 bg-down/12 text-down",
  // Green, the same pair as `win`: the Activity frames draw Live in the signal
  // green they draw Won in, and the pulsing dot is what tells the two apart.
  // A surface that wants Live to read as unresolved passes `pending` instead,
  // which is how the In Progress cards get their amber.
  live: "border-up/35 bg-up/12 text-up",
  pending: "border-amber-200/25 bg-amber-200/10 text-amber-200/80",
  done: "border-white/12 bg-white/6 text-white/70",
  neutral: "border-white/10 bg-white/4 text-white/50",
};

export interface StatusChipProps {
  /** The colour and the meaning. Map a feature's status onto it at the call site. */
  tone: StatusTone;
  /**
   * The words on the chip, already translated. This primitive holds no message
   * keys: baking a catalogue lookup in would weld it to one screen's statuses,
   * which is the mistake the six chips before it made.
   */
  label: string;
  /** Extra classes on the chip, for the layout a given row wants. */
  className?: string;
}

/**
 * The coloured status pill on an activity row, a ticket, a holding or a card.
 *
 * Geometry comes from `TypeChip`, which was the closest thing to a primitive
 * the tree had. The pulsing dot on `live` comes from `DepositStatus`, where it
 * is what tells a reader a still screen is not a stalled one.
 */
export function StatusChip({ tone, label, className }: StatusChipProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-sans text-[11px] font-medium whitespace-nowrap",
        TONE_STYLE[tone],
        className
      )}
    >
      {tone === "live" ? (
        // currentColor, so the dot never drifts from the label if the live
        // palette is retuned.
        <span aria-hidden className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
      ) : null}
      {label}
    </span>
  );
}
