"use client";

interface SyncingValueProps {
  /** The value as it currently reads. */
  children: React.ReactNode;
  /** True while this figure is known to be catching up. */
  syncing: boolean;
  className?: string;
}

/**
 * A figure that shows it is catching up.
 *
 * The problem it solves is specific: after a mint or a burn, the number on
 * screen is briefly the OLD one — correct a second ago, wrong now — and
 * presenting it unchanged makes a successful action look like it did nothing.
 * A spinner in its place is worse: it hides information the user already has.
 *
 * So the old value stays legible and visibly provisional, then settles back to
 * full weight when the new one lands. The transition IS the signal; a colour
 * flash on top read as an alert for something that is merely routine.
 */
export function SyncingValue({ children, syncing, className }: SyncingValueProps) {
  return (
    <span
      className={[
        "inline-flex items-baseline transition-opacity duration-300",
        syncing ? "animate-pulse opacity-55" : "opacity-100",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </span>
  );
}
