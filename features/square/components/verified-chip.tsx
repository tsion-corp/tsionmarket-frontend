"use client";

/**
 * The square's verification mark, as the design draws it: a blue-outlined
 * chip rather than a tick.
 *
 * Renders nothing unless the profile is actually verified — an outline around
 * an unverified account is worse than no mark at all.
 */
export function VerifiedChip({ verification }: { verification?: string }) {
  if (verification !== "verified") return null;
  return (
    <span
      className="shrink-0 rounded-full border border-[#008CFF] bg-white/4 px-1.5 py-px text-[8px] font-bold tracking-wide text-white uppercase"
      title="Verified"
    >
      Market
    </span>
  );
}
