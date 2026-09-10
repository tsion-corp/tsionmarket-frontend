"use client";

import { ChevronLeftIcon } from "@/components/ui/icons";

// The disclosure chrome the phone memecoin screen stacks its sections on: the
// caret every collapsible header carries, and the labelled row that opens the
// chart and the metrics.
//
// It lives in its own module because the caret is shared by three callers on
// that screen (the pair control, the two disclosure rows, and the transactions
// card), and importing it back out of the board would make the board and the
// transactions card import each other.

export function Caret({ open }: { open: boolean }) {
  // The icon set ships a left chevron only; a quarter turn points it down, and
  // a further half turn points it up when the section is open.
  return (
    <ChevronLeftIcon
      size={12}
      className={`shrink-0 text-white/70 transition-transform ${open ? "rotate-90" : "-rotate-90"}`}
    />
  );
}

// One of the two disclosure rows. The dot and the glyph carry the design's
// yellow, #FFD62F, which is --color-kash.
//
// The row is 16px tall in the design, which is not a tap target, so the hit
// area is grown to 44px with an inset pseudo-element instead of by padding the
// row: padding would push everything under it down and break the 12px rhythm
// the design stacks these blocks on.
export function BoardDisclosure({
  icon,
  label,
  open,
  onToggle,
  controls,
}: {
  icon: React.ReactNode;
  label: string;
  open: boolean;
  onToggle: () => void;
  controls: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-controls={controls}
      className="relative flex w-fit cursor-pointer items-center gap-[8px] text-left text-white before:absolute before:inset-x-0 before:-inset-y-[14px] before:content-['']"
    >
      <span className="flex items-center gap-[4px]">
        <span aria-hidden className="bg-kash size-[3px] shrink-0 rounded-full" />
        <span aria-hidden className="text-kash flex items-center">
          {icon}
        </span>
        <span className="font-serif text-[12px] font-semibold tracking-[-0.02em]">{label}</span>
      </span>
      <Caret open={open} />
    </button>
  );
}
