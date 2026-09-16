"use client";

import { cn } from "@/lib/utils";

/**
 * The pager pills under the deck, carried over from the Square
 * (market-square-frontend/components/ui/deck-dots.tsx): Home's five, the
 * current one long in the Square's purple, the rest short in #D9D9D9.
 */
const DOT = {
  row: "gap-[3.63px]",
  pill: "h-[5.81px] rounded-[18.14px]",
  on: "w-[36.29px]",
  off: "w-[13.79px]",
};

export function SquareDeckDots({
  count,
  active,
  className,
}: {
  count: number;
  active: number;
  className?: string;
}) {
  const current = Math.min(Math.max(active, 0), count - 1);
  return (
    <div aria-hidden className={cn("flex items-center justify-center", DOT.row, className)}>
      {Array.from({ length: count }, (_, index) => (
        <span
          key={index}
          className={cn(
            DOT.pill,
            "block transition-all",
            index === current ? cn(DOT.on, "bg-[#7E3BEB]") : cn(DOT.off, "bg-[#D9D9D9]")
          )}
        />
      ))}
    </div>
  );
}
