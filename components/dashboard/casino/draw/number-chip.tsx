"use client";

// One ball/number chip in the draw screens. Matched numbers glow gold, the
// bonus ball carries a violet ring, everything else stays quiet.
export type NumberChipVariant = "plain" | "matched" | "bonus";

const VARIANT_CLASS: Record<NumberChipVariant, string> = {
  plain: "border border-white/10 bg-white/6 text-white",
  matched: "bg-grey-100 text-ink font-bold",
  bonus: "border border-accent bg-white/6 text-accent",
};

export function NumberChip({
  num,
  variant = "plain",
  size = 28,
}: {
  num: number;
  variant?: NumberChipVariant;
  size?: number;
}) {
  return (
    <span
      className={`tnum grid shrink-0 place-items-center rounded-full text-[12px] ${VARIANT_CLASS[variant]}`}
      style={{ width: size, height: size }}
    >
      {num}
    </span>
  );
}
