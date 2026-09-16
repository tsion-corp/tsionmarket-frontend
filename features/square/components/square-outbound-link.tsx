"use client";

import { IconVoiceMode } from "@/features/square/components/square-home-icons";

/**
 * A "do more" control on the Square page: a pill that opens the Square's own
 * deployment on exactly the room, person, house or post the card shows.
 *
 * Always a new tab with an opener-less window, because the destination is a
 * sibling deployment rather than a route here. Renders nothing without an
 * address: a pill that goes nowhere is worse than no pill, the rule every
 * cross-product link in this app follows.
 *
 * Three looks, the three the Square's Home draws:
 *   · create: the purple ramp Home puts on its one action per card, with the
 *     voice glyph after the label ("Join Gistroom");
 *   · quiet: a 5% white pill in a 20% ring ("Open the Square");
 *   · viewMore: the Square's own "View more" pill beside a heading, in its
 *     Manrope with its purple chevron export.
 *
 * The ramp's two purples are the Square's own, stated here once.
 */
export const SQUARE_RAMP = "linear-gradient(90deg, #9f65fd 0%, #5b05e6 100%)";

export function SquareOutboundLink({
  href,
  label,
  variant = "create",
  className = "",
  ariaLabel,
}: {
  href: string | null;
  label: string;
  variant?: "create" | "quiet" | "viewMore";
  className?: string;
  /** For a pill whose visible label is not the whole story. */
  ariaLabel?: string;
}) {
  if (!href) return null;
  const shared =
    "ws-pressable inline-flex shrink-0 items-center transition-opacity hover:opacity-90";
  const look =
    variant === "create"
      ? "h-5 gap-[3px] rounded-[30px] px-3 text-[11px] leading-none font-medium text-white"
      : variant === "quiet"
        ? "gap-1 rounded-full bg-white/5 px-2.5 py-2 text-[9px] leading-3 font-medium text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.2)]"
        : "gap-[14px] rounded-full bg-white/[0.04] py-1 pr-[3px] pl-2.5 font-[family-name:var(--font-heading)] text-[10px] leading-6 font-semibold tracking-[0.015em] text-white hover:bg-white/[0.08]";
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={ariaLabel}
      style={variant === "create" ? { background: SQUARE_RAMP } : undefined}
      className={`${shared} ${look} ${className}`}
    >
      {label}
      {variant === "create" ? <IconVoiceMode className="h-[11px] w-[11px]" /> : null}
      {variant === "viewMore" ? (
        // eslint-disable-next-line @next/next/no-img-element -- the Square's own export
        <img src="/square-home/view-more-arrow.svg" alt="" aria-hidden className="h-4 w-4" />
      ) : null}
    </a>
  );
}
