import Link from "next/link";

// The padding contract for every discovery pill.
//
// The design's 14px pill measures 16px of inline padding and 10px of block
// padding, with 6px between the glyph and the label. Read as a share of the
// type that is 8/7em, 5/7em and 3/7em, and the rest of the set is the same
// shape drawn at its own size: the 17px Eth Africa pill gets 19.429/12.143
// instead of wearing the small pill's gutters.
//
// The measured numbers are also the floor. A 12px pill keeps the design's
// 16/10 rather than shrinking with the type, because the complaint that
// started this work was pills whose labels sat too close to the edge, and no
// pill should leave here tighter than the one the designer drew.
const PILL_INLINE_RATIO = 8 / 7;
const PILL_BLOCK_RATIO = 5 / 7;
const PILL_GAP_RATIO = 3 / 7;
const PILL_MIN_INLINE = 16;
const PILL_MIN_BLOCK = 10;
const PILL_MIN_GAP = 6;

/** Three decimals, the precision the design's own measurements are given at. */
function roundToDesignPrecision(value: number) {
  return Math.round(value * 1000) / 1000;
}

/**
 * The gutters a discovery pill of this font size gets. Exported so the pills
 * that cannot use `DiscoveryCta`, because the design gives them a different
 * fill or puts the glyph after the label, still sit on the same contract.
 * The values are plain numbers for a React style object, which renders them
 * as pixels.
 */
export function discoveryPillPadding(size: number) {
  return {
    paddingInline: roundToDesignPrecision(Math.max(PILL_MIN_INLINE, size * PILL_INLINE_RATIO)),
    paddingBlock: roundToDesignPrecision(Math.max(PILL_MIN_BLOCK, size * PILL_BLOCK_RATIO)),
    gap: roundToDesignPrecision(Math.max(PILL_MIN_GAP, size * PILL_GAP_RATIO)),
  };
}

/**
 * What the pill does: go somewhere, or act here. Never both.
 *
 * A pill that opens a sheet over the card is not a link, and rendering it as
 * one would promise a page that is never loaded: middle click and "open in new
 * tab" would both land on a destination the reader did not ask for. So an
 * acting pill is a real button, and the union makes the two mutually exclusive
 * rather than leaving a caller to pass both and pick a winner at runtime.
 */
type DiscoveryCtaAction = { href: string; onClick?: never } | { onClick: () => void; href?: never };

interface DiscoveryCtaBase {
  label: string;
  /** "dark" is the black pill on a light card, "light" the white pill on a dark one. */
  tone: "dark" | "light";
  /** Leading glyph, already sized by the caller. */
  icon?: React.ReactNode;
  /** Design sizes run from 12px on the arena card to 17px on Eth Africa. */
  size?: number;
  /**
   * A class that sets the label size instead of `size` doing it inline, for a
   * pill that has to step down at a breakpoint. An inline font size wins over
   * any class, so the two cannot both be in play: passing this drops the
   * inline one. `size` still sets the gap between glyph and label.
   */
  sizeClassName?: string;
  /**
   * A sibling deployment rather than a route here: the pill becomes a plain
   * anchor opening a new tab, since the router has no page to prefetch.
   */
  external?: boolean;
  /**
   * Padding classes, for the few pills the design draws to its own numbers
   * rather than to the size scale. Passing this replaces the derived padding
   * outright; the gap between glyph and label still comes from the scale.
   */
  padding?: string;
  className?: string;
}

type DiscoveryCtaProps = DiscoveryCtaBase & DiscoveryCtaAction;

// Every discovery card ends in one of these: a rounded pill, black on the light
// cards and white on the dark ones, carrying the design's Mona Sans semibold.
//
// The pill sizes to its own label, so a longer locale widens it instead of
// cutting the label off. `max-w-full` is the backstop: once the pill has used up
// the box it was given, the label wraps and the pill gets taller rather than
// spilling over the card. Callers that want the design's width ask for it as a
// minimum (`min-w-[125px]`), never as a fixed `w-`, which would clip.
//
// The gutters survive that wrap because of the `min-w-0` on the label. Without
// it the label is a flex item at `min-width: auto`, which resolves to the width
// of its longest word, and a German compound long enough to beat the pill would
// refuse to shrink and push straight through the padding. At `min-width: 0` the
// item gives way, `break-words` breaks the compound, and the padding stays what
// it was: room that belongs to the box rather than slack a short English string
// happened to leave. The glyph is held out of that negotiation, so it keeps
// both its own size and its distance from the label.
//
// Hover is the one treatment used across the whole redesign: `ws-pressable`
// lifts and presses the pill and nothing else moves. No shadow on hover; the
// resting shadows some cards pass in are design-verified and stay.
export function DiscoveryCta({
  href,
  onClick,
  label,
  tone,
  icon,
  size = 14,
  sizeClassName,
  external,
  padding,
  className = "",
}: DiscoveryCtaProps) {
  const pill = discoveryPillPadding(size);

  const style = {
    ...(sizeClassName ? null : { fontSize: size }),
    gap: pill.gap,
    ...(padding ? null : { paddingInline: pill.paddingInline, paddingBlock: pill.paddingBlock }),
  };
  const classes = `ws-pressable inline-flex max-w-full shrink-0 items-center justify-center rounded-full ${padding ?? "md:py-[10px] py-[14px]"} ${sizeClassName ?? ""} text-center font-serif font-semibold ${
    tone === "dark" ? "bg-black text-white" : "bg-white text-[#0a0a0a]"
  } ${className}`;
  const content = (
    <>
      {icon ? <span className="inline-flex shrink-0 items-center">{icon}</span> : null}
      <span className="min-w-0 break-words">{label}</span>
    </>
  );

  // The button carries `type` because a pill inside a form would otherwise
  // submit it, and the design's own font: a button does not inherit one.
  if (href === undefined) {
    return (
      <button type="button" onClick={onClick} style={style} className={`${classes} font-[inherit]`}>
        {content}
      </button>
    );
  }
  return external ? (
    <a href={href} target="_blank" rel="noopener noreferrer" style={style} className={classes}>
      {content}
    </a>
  ) : (
    <Link href={href} style={style} className={classes}>
      {content}
    </Link>
  );
}
