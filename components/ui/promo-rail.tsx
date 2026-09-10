import Link from "next/link";

import { Carousel } from "@/components/ui/carousel";

// The rail card the design draws, in design pixels.
//
// Frame 1:11444 lays its three banners out as a scroller of equal cards: 515,
// 515.768 and 512 wide, 22 apart, 1586.77 of content inside a 1001 row. Their
// heights disagree by a few pixels because the designer resized each by hand,
// but the two drawn as artwork agree on a ratio to four decimals (515.768 / 88
// and 512 / 87.3571 are both 5.861), so that is the card's shape.
//
// The rail row in the design (node 1:11445) measures 93.2367, but that figure
// is a bounding box, not a banner height. Its tallest banner, Set the stake,
// draws both of its stub edges from the same 27.4179 x 91.7082 export, and the
// left one is placed 1.5285 lower than the right, so the row's box comes out as
// one ticket plus that offset. The ticket is 91.7082, and that is the height
// the banners were measured at.
//
// Nothing renders at this size. The rail is a carousel now, and it sizes its
// slides to fill the rail's width, so a banner is whatever width the slide is.
// These two numbers stay because every measurement inside a banner is written
// as a share of them: the card scales as one piece, which is the only way to
// resize a banner whose stub edges are a column of circles.
const CARD_HEIGHT = 91.7082;
const CARD_WIDTH = (515.768 / 88) * CARD_HEIGHT;

// The banner's fill sits inside the stub edges rather than under them, and the
// stub is as wide as its own export.
const FILL_INSET_TOP = 4.59;
const FILL_INSET_LEFT = 18.34;
const FILL_INSET_RIGHT = 19.78;
const STUB_WIDTH = 27.4179;

// Where the design puts the leading illustration inside the fill, and how big.
const GLYPH_TOP = 7.64;
const GLYPH_LEFT = 18.34;
const GLYPH_WIDTH = 59.62;
const GLYPH_HEIGHT = 99.19;

// The clear space a banner keeps between its words and everything around them:
// the illustration on the left, the stub edge on the right, the fill's top and
// bottom, and the hairline in the middle. The design leaves the subtitle flush
// against the right stub and the title a dozen pixels off the torch, which is
// enough only while the words are English and short. These are part of the box,
// so no translation can close them.
//
// The vertical figure is smaller than the horizontal one because the card is
// six times wider than it is tall: the same number top and bottom would read as
// a band, not as breathing room.
const EDGE_GUTTER = 14;
const EDGE_GUTTER_Y = 7;
const DIVIDER_GAP = 9;
const DIVIDER_WIDTH = 1.53;
const DIVIDER_HEIGHT = 22.93;

// A design pixel as a share of the card, across and down. The card's shape is
// fixed, so the two axes scale together.
function acrossPct(designPx: number) {
  return `${((designPx / CARD_WIDTH) * 100).toFixed(4)}%`;
}

function downPct(designPx: number) {
  return `${((designPx / CARD_HEIGHT) * 100).toFixed(4)}%`;
}

// A design pixel as a share of the card's width, for the things a percentage
// cannot size: type, and anything measured inside a nested box.
function cqw(designPx: number) {
  return `${((designPx / CARD_WIDTH) * 100).toFixed(4)}cqw`;
}

// The stub edge the designer puts on both ends of every rail banner: a column
// of circles in the banner's own colour, so the card reads as a torn ticket.
// The exported shape is symmetric left to right, so the same file serves both
// ends without a flip. The colour is baked into the export, which is why each
// banner brings its own.
//
// Height is pinned and width follows the export's own ratio, so a stub drawn to
// a different box than the ember one still arrives with round circles.
function ScallopEdge({ src, side }: { src: string; side: "left" | "right" }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      aria-hidden
      className={`pointer-events-none absolute top-0 h-full w-auto ${
        side === "left" ? "left-0" : "right-0"
      }`}
    />
  );
}

interface PromoRailProps {
  /** Accessible name for the rail, e.g. "Promotions". */
  label: string;
  /** One banner per slide. */
  children: React.ReactNode;
}

// The strip of promotions under the balance cards, as a carousel.
//
// The carousel divides the rail between the banners it shows and the sliver of
// the next one, so the row reaches both edges of the rail at every width: no
// bare gutter, and enough of the following banner in view that the strip reads
// as something that moves. Each banner fills the slide it is given and scales
// as one piece, so the four edges still line up.
export function PromoRail({ label, children }: PromoRailProps) {
  return (
    <div className="rounded-[14px] bg-[#232222] px-[21px] py-[11px]">
      {/* 22 is the gap the design sets between rail banners. */}
      <Carousel label={label} gapPx={22}>
        {children}
      </Carousel>
    </div>
  );
}

// One piece of decorative art on a banner, in the design's own pixels and
// measured from the fill's top left corner, the way the design draws it. The
// banner converts these to a share of the card, so a glow that runs off the
// right edge keeps running off it whatever width the rail hands the banner.
// Coordinates may be negative, which is how the design anchors a glow that is
// wider than the card.
interface PromoArt {
  src: string;
  top: number;
  left: number;
  width: number;
  height: number;
}

interface PromoBannerProps {
  href: string;
  title: string;
  subtitle: string;
  /** The banner's fill. */
  background: string;
  /**
   * The banner's stub edge, exported in the banner's own colour. Defaults to
   * the ember edge the Set the stake banner uses, which is the only stub the
   * rail carried before a second colour existed.
   */
  scallop?: string;
  /** Decorative art laid over the fill, behind the words. */
  art?: PromoArt[];
  /** Leading illustration, e.g. the stake banner's torch. */
  glyph?: string;
}

// A banner whose words are real text. Feature-agnostic: it takes its colour,
// art and destination, and knows nothing about what it is promoting.
//
// It fills the width it is handed and keeps the card's shape, and every
// measurement inside is a share of that card, so the whole banner scales as one
// piece. Its words are laid out rather than drawn, so it is the one shape that
// also adapts to a long translation: the title and the subtitle share the room
// between the illustration and the right stub edge, and the subtitle wraps
// inside it. That room is a gutter shorter than the card at every edge, so the
// longest locale still has clear space around it rather than filling the card
// to its border.
export function PromoBanner({
  href,
  title,
  subtitle,
  background,
  scallop = "/market/promo-stake-scallop.svg",
  art,
  glyph,
}: PromoBannerProps) {
  return (
    <Link
      href={href}
      className="ws-pressable @container relative block w-full"
      style={{ aspectRatio: `${CARD_WIDTH} / ${CARD_HEIGHT}` }}
    >
      {/* The insets are the design's, measured from the ticket's own top rather
          than from the row's box: the fill sits 18.34px in on the left and
          19.78px on the right so the stub edges overlap it, and 4.59px off the
          top and the bottom. */}
      <span
        aria-hidden
        className="absolute overflow-hidden"
        style={{
          top: downPct(FILL_INSET_TOP),
          bottom: downPct(FILL_INSET_TOP),
          left: acrossPct(FILL_INSET_LEFT),
          right: acrossPct(FILL_INSET_RIGHT),
          background,
        }}
      >
        {art?.map((piece) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={piece.src}
            src={piece.src}
            alt=""
            className="absolute max-w-none"
            style={{
              top: cqw(piece.top),
              left: cqw(piece.left),
              width: cqw(piece.width),
              height: cqw(piece.height),
            }}
          />
        ))}
        {glyph ? (
          // Sits inside the fill so it is clipped by the banner's edges, the
          // way the design draws the torch running off the bottom. Measured in
          // cqw rather than in percentages of the fill, because the fill is a
          // different box from the card these figures were taken against.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={glyph}
            alt=""
            className="absolute"
            style={{
              top: cqw(GLYPH_TOP),
              left: cqw(GLYPH_LEFT),
              height: cqw(GLYPH_HEIGHT),
              width: cqw(GLYPH_WIDTH),
            }}
          />
        ) : null}
      </span>
      <ScallopEdge src={scallop} side="left" />
      <ScallopEdge src={scallop} side="right" />

      {/* The words run from the illustration to the right stub edge and no
          further, with a gutter held clear at each end and above and below. The
          title takes the line it needs, the subtitle takes what is left and
          wraps inside it: French, German and Portuguese all ask for a second
          line, which the banner has room for.
          Two lines is the cap, because that is what fits with room to spare
          above and below. A third would leave four pixels of card around
          eighty-four pixels of text, which is the cramping this padding exists
          to stop. No locale we ship needs one. */}
      <span
        className="absolute inset-0 flex items-center overflow-hidden"
        style={{
          gap: cqw(DIVIDER_GAP),
          // Clear of the illustration when there is one, clear of the fill's
          // own left edge when there is not.
          paddingLeft: cqw(
            glyph
              ? FILL_INSET_LEFT + GLYPH_LEFT + GLYPH_WIDTH + EDGE_GUTTER
              : FILL_INSET_LEFT + EDGE_GUTTER
          ),
          paddingRight: cqw(STUB_WIDTH + EDGE_GUTTER),
          paddingBlock: cqw(FILL_INSET_TOP + EDGE_GUTTER_Y),
        }}
      >
        <span
          // Chewy asks for a line box of 1.29 to hold its own ascenders and
          // descenders. The design sets 0.86, and because the title clips to
          // draw its ellipsis, the missing fifth of an em was taken off the
          // glyphs: it cut the tail off the "ç" in "Faça A Sua Aposta".
          className="ws-poster min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-white capitalize"
          style={{ fontSize: cqw(24.46), lineHeight: 1.3 }}
        >
          {title}
        </span>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/market/promo-banner-divider.svg"
          alt=""
          aria-hidden
          className="shrink-0"
          style={{ height: cqw(DIVIDER_HEIGHT), width: cqw(DIVIDER_WIDTH) }}
        />
        <span
          className="line-clamp-2 min-w-0 flex-1 font-serif font-medium text-white capitalize"
          style={{
            fontSize: cqw(18.34),
            lineHeight: 1.52,
            // In em, so the tracking scales with the type rather than fighting it.
            letterSpacing: `${(-0.37 / 18.34).toFixed(6)}em`,
          }}
        >
          {subtitle}
        </span>
      </span>
    </Link>
  );
}

interface PromoArtBannerProps {
  href: string;
  /** The banner's accessible name. The illustration carries its own words. */
  label: string;
  /** One exported illustration covering the whole banner, stub edge included. */
  src: string;
  /** Both required: the export's own pixel size, which fixes its aspect ratio. */
  width: number;
  height: number;
}

// A banner drawn entirely as one exported illustration, for the promotions the
// designer sets as artwork rather than as a headline over a flat fill.
//
// The export fills the slide it is given and keeps its own aspect ratio, so it
// never has its baked-in stub circles turned into ovals. The design draws every
// rail card to one ratio, so an export taken from it comes out the same height
// as the banners beside it. Pass an export drawn to some other ratio and it will
// not, which is the honest outcome: squaring it up would mean distorting the
// artwork.
export function PromoArtBanner({ href, label, src, width, height }: PromoArtBannerProps) {
  return (
    <Link
      href={href}
      aria-label={label}
      className="ws-pressable relative block w-full"
      style={{ aspectRatio: `${width} / ${height}` }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" width={width} height={height} className="block h-full w-full" />
    </Link>
  );
}
