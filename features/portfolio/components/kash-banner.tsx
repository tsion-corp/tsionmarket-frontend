"use client";

import { useTranslations } from "next-intl";
import { useFitText } from "@/hooks/use-fit-text";

// The banner is drawn to a 515.768 x 88 box in the design. Positions below are
// that box expressed as a share of it, so the whole thing scales as one piece
// whatever size it is given: the phone gives it the full column, the promo rail
// gives it a carousel slide, and the ratio fixes the height either way.
const DESIGN_WIDTH = 515.768;
const DESIGN_HEIGHT = 88;

// A design pixel as a share of the banner's width. The banner's ratio is fixed,
// so one unit works for both axes.
function acrossPct(designPx: number) {
  return `${((designPx / DESIGN_WIDTH) * 100).toFixed(4)}%`;
}

// A design pixel as a share of the banner's width, for the things a percentage
// cannot size: type, and the metrics inside the text row.
function cqw(designPx: number) {
  return `${((designPx / DESIGN_WIDTH) * 100).toFixed(4)}cqw`;
}

// The same, with a floor, so type does not shrink past legibility when the
// phone hands this banner a narrow column.
function cqwAtLeast(designPx: number, floorPx: number) {
  return `max(${floorPx}px, ${cqw(designPx)})`;
}

// The stub edge's own export width, and the clear space the words keep inside
// it. The design ends the text slot 0.66px short of the stub, which is not a
// gap: in every locale the subline's last line runs right up to the circles.
// This gutter is part of the box, so no string can sit against the edge.
const STUB_WIDTH = 27.2165;
const EDGE_GUTTER = 12;

// The row of words the design lays between the coins and the right stub. The
// coin cluster's artwork stops at 205 across the band the headline sits in,
// read off the export, so the design's own left edge is already eleven design
// pixels clear of it and needs no gutter of its own.
const TEXT_SLOT_LEFT = 216.31;
const TEXT_SLOT_WIDTH = DESIGN_WIDTH - STUB_WIDTH - EDGE_GUTTER - TEXT_SLOT_LEFT;

// The hairline the design stands between the two halves, and the clear space
// either side of it. The design leaves 7.684 for the hairline and both its
// margins together, so the headline's last letter almost touches it. Nine
// design pixels of that gap were the hairline's own margins; here they are.
const DIVIDER_WIDTH = 0.8929;
const DIVIDER_GAP = 7;

// The subline's share of the row. The design gives it 107.152 for three lines
// of 7.78px type, which is about a third more than the longest of the five
// sublines we ship needs. Taking that third back and giving it to the headline
// pays for the gutters above and still leaves the headline wider than it had.
const SUBLINE_WIDTH = 98;

const HEADLINE_SLOT_WIDTH = TEXT_SLOT_WIDTH - SUBLINE_WIDTH - DIVIDER_WIDTH - 2 * DIVIDER_GAP;
const HEADLINE_FONT_SIZE = 43.238;
const HEADLINE_TRACKING = -2.2091 / HEADLINE_FONT_SIZE;

// A first estimate of how wide a headline renders, in ems of its own font
// size, at the design's tracking. The headline is set in the display face,
// Mona Sans bold, and 0.6em is a fair average advance for a bold sans; the
// rendered text is measured on mount and the estimate corrected, so this only
// decides the server's first paint. Chrome applies letter-spacing after the
// last character too, which is why every character is charged for it.
const ESTIMATED_ADVANCE_EM = 0.6;

function headlineEm(headline: string) {
  let em = 0;
  for (const _ of headline) em += ESTIMATED_ADVANCE_EM + HEADLINE_TRACKING;
  return em;
}

// How far to scale the headline down so it fits the slot beside the subline.
//
// The design sizes that slot to the English string with nothing to spare, so
// most other locales are too wide for it: "Prends du Kash+" is 64% wider than
// "Get Kash+". Type is the thing that can give here. The words are one line
// against fixed artwork, so they cannot wrap and cannot push anything aside,
// and cutting them off is not an option.
function estimatedHeadlineScale(headline: string) {
  return Math.min(1, HEADLINE_SLOT_WIDTH / (headlineEm(headline) * HEADLINE_FONT_SIZE));
}

// The design's fill sits inside the stub edges rather than under them.
const FILL_AREA = {
  left: `${((21.2416 / DESIGN_WIDTH) * 100).toFixed(4)}%`,
  top: `${((3.0344 / DESIGN_HEIGHT) * 100).toFixed(4)}%`,
  width: `${((473.379 / DESIGN_WIDTH) * 100).toFixed(4)}%`,
  height: `${((81.931 / DESIGN_HEIGHT) * 100).toFixed(4)}%`,
};

interface KashBannerProps {
  onBuy: () => void;
}

// The Kash promo banner, built to the Market design: a gold ticket with a stub
// edge at each end, the coin cluster and its rate badges on the left, a cloud
// bank along the top, and the headline over a fine subline on the right. The
// whole card is the button.
//
// The artwork is one export drawn to the fill area, so it can never leave a gap
// or sit as an island whatever size the banner is given. The words are real
// text laid over it rather than baked into the export, so they translate.
//
// The whole banner scales as a unit. It has no way to absorb spare width on its
// own: the export bakes in the cloud bank across the top and the stub edge at
// each end, and widening it alone would flatten the coins into ovals and stop
// the clouds halfway. So it fills whatever width it is given at the design's own
// ratio, and nothing ever asks it to stretch: the phone hands it the column, the
// promo rail hands it a carousel slide, and both are the same card at a
// different scale.
export function KashBanner({ onBuy }: KashBannerProps) {
  const t = useTranslations("kash");
  // The design splits the sentence into a headline and a fine subline beneath.
  const headline = t("railTitle");
  const subline = t("railSubtitle");
  // Measured against the slot it sits in; the estimate is the server's first paint.
  const { ref: headlineRef, scale: headlineScale } = useFitText<HTMLSpanElement>(
    headline,
    estimatedHeadlineScale(headline)
  );

  return (
    <button
      type="button"
      onClick={onBuy}
      className="ws-pressable @container relative block w-full cursor-pointer overflow-hidden text-left"
      style={{ aspectRatio: `${DESIGN_WIDTH} / ${DESIGN_HEIGHT}` }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/market/kash-banner-art.svg"
        alt=""
        aria-hidden
        className="pointer-events-none absolute"
        style={FILL_AREA}
      />
      {/* The stub edge the designer puts on both ends of a rail banner. The
          exported shape is symmetric left to right, so one file serves both. */}
      {(["left", "right"] as const).map((side) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={side}
          src="/market/kash-banner-scallop.svg"
          alt=""
          aria-hidden
          className={`pointer-events-none absolute inset-y-0 h-full ${
            side === "left" ? "left-0" : "right-0"
          }`}
          style={{ width: acrossPct(STUB_WIDTH) }}
        />
      ))}

      {/* The words sit in the slot between the coins and the right stub's
          gutter, and the row's own gap holds the hairline clear of both halves.
          Nothing here clips: the headline is scaled to its share, so it cannot
          outgrow it, and clipping it was what cut the tail off the "g" in
          "Consigue Kash+" and "Pegue Kash+". */}
      <span
        className="absolute top-[35.34%] flex h-[40.166%] items-center"
        style={{
          left: acrossPct(TEXT_SLOT_LEFT),
          right: acrossPct(STUB_WIDTH + EDGE_GUTTER),
          gap: cqw(DIVIDER_GAP),
        }}
      >
        <span
          ref={headlineRef}
          className="ws-poster min-w-0 flex-1 whitespace-nowrap text-[rgba(108,43,9,0.94)]"
          style={{
            // The design's size, scaled to the locale and the face. Tracking is
            // in em so it scales with the type rather than fighting it.
            fontSize: `calc(${cqw(HEADLINE_FONT_SIZE)} * ${headlineScale.toFixed(4)})`,
            lineHeight: 1,
            letterSpacing: `${HEADLINE_TRACKING.toFixed(6)}em`,
          }}
        >
          {headline}
        </span>
        {/* The hairline the design sets between the two halves. */}
        <span
          aria-hidden
          className="shrink-0 rounded-full bg-[#FBEAA7]/80"
          style={{ width: cqw(DIVIDER_WIDTH), height: cqw(25.002) }}
        />
        <span
          // Three lines is what the slot holds. French and Portuguese use all
          // three; anything longer ends in an ellipsis rather than a half line.
          // The leading is the design's plus enough to clear a descender, which
          // the clamp used to cut off the bottom line of.
          className="line-clamp-3 max-h-full shrink-0 font-sans font-bold text-[rgba(108,43,9,0.72)]"
          style={{
            width: cqw(SUBLINE_WIDTH),
            fontSize: cqwAtLeast(7.78, 6),
            lineHeight: cqwAtLeast(9.94, 7.7),
          }}
        >
          {subline}
        </span>
      </span>
    </button>
  );
}
