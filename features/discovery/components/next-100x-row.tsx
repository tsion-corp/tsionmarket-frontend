"use client";

// The whole module is a client module because the memecoin card runs a timer.
// The boundary cannot be pushed deeper without splitting the file, and both
// callers, the dashboard and the preview harness, are already client pages, so
// nothing that was rendering on the server stops doing so.

import { useCallback, useRef, useState } from "react";
import { preload } from "react-dom";
import { useTranslations } from "next-intl";
import { Carousel } from "@/components/ui/carousel";
import { DiscoveryRow } from "@/features/discovery/components/discovery-row";
import { DiscoveryCta } from "@/features/discovery/components/discovery-cta";
import type { MemeSpot } from "@/features/discovery/types";
import { useRotatingIndex } from "@/hooks/use-rotating-index";

// Both cards carry the same hairline: #bab4b4 along the top edge, fading to
// nothing by the bottom. A gradient border needs two background layers, one
// clipped to the padding box for the fill and one to the border box for the
// edge, because border-image does not follow a border radius.
const CARD_EDGE = "linear-gradient(180deg, #bab4b4 0%, rgba(186, 180, 180, 0) 100%) border-box";
const PEPE_CARD_SURFACE = `linear-gradient(#000000, #000000) padding-box, ${CARD_EDGE}`;
const MEME_CARD_SURFACE = `linear-gradient(180deg, #ed2b07 0%, #ff846e 100%) padding-box, ${CARD_EDGE}`;

// A card is now a carousel slide rather than a grid column. The slide sets the
// width, so the card takes it from the block it is in; h-full squares it up
// against the taller slide in view, and the design's height stays the floor.
const CARD_BOX =
  "relative h-full min-h-[212px] overflow-hidden rounded-[18px] border-[1.03px] border-transparent shadow-[inset_0_1.41px_0_rgba(255,255,255,0.15)]";

// The white pill on both cards is not flat: it dips to a light grey around the
// two-thirds mark and lifts again at the foot, with a hairline of white inside
// the top edge, and it sits a little off the card. All three are drawn at rest
// in the design and none of them changes on hover, so they stay out of the way
// of the one hover treatment DiscoveryCta carries for every pill in the
// redesign. Sits on top of DiscoveryCta's own bg-white.
const CTA_SURFACE =
  "bg-[linear-gradient(179deg,#ffffff_2.36%,#ededf0_38.57%,#cbcbd1_62.39%,#f5f5f8_97.64%)] shadow-[inset_0_0.81px_0_rgba(255,255,255,0.95)] drop-shadow-[0_1.63px_6.51px_rgba(0,0,0,0.5)]";

// Every backdrop layer here is a ray burst exported with
// preserveAspectRatio="none", so it is meant to be stretched. Sizing one as a
// percentage of the card keeps the exact footprint the design gives it, whatever
// width the card ends up with, instead of leaving the card bare beside it.
const BACKDROP = "pointer-events-none absolute bg-[length:100%_100%] bg-no-repeat";

// Both pills give their label 20px on each side in the design: the Pepe pill
// declares 11px but is pinned to 125px around an 85px row, which centres out to
// 20px, and the Shiba pill declares 19px and 20px outright. DiscoveryCta's
// default is 16px, which is the padding a short English label can afford and a
// long German one cannot, so the design's own figure is passed in instead.
// Vertical stays the component's: 10px plus the label's half-leading already
// lands on the design's 13px.
const CTA_PADDING = "px-5 py-2.5";

// Room under the pill. The design leaves 33px on the Pepe card and 35px on the
// Shiba one below the pill's bottom edge, which the old 15px only matched
// because the 212px floor was padding out the difference. Once a locale wraps a
// heading and pushes the card past that floor, this is the whole gap.
const CARD_FOOT = "pb-8";

interface GainChip {
  /** Centre of the chip, in the 484x212 stage's own pixels. */
  x: number;
  y: number;
  /** Degrees of lean. Every chip also carries the same -1.27deg skew. */
  tilt: number;
  width: number;
  height: number;
  /** Hairline around the chip, and the type size inside it. */
  border: number;
  font: number;
}

// The percentages scattered over the Pepe card. Sizes, angles and offsets are
// the designer's: they read as confetti thrown around the avatar rather than as
// data, so nothing here is derived from a number.
const GAIN_CHIPS: readonly GainChip[] = [
  { x: 74.5, y: 45.7, tilt: -10.82, width: 80.6, height: 34.7, border: 1.15, font: 16.9 },
  { x: 171.6, y: 14.7, tilt: -7, width: 44.5, height: 19.1, border: 0.63, font: 9.31 },
  { x: 167.3, y: 64, tilt: 8.74, width: 58.9, height: 25.3, border: 0.84, font: 12.34 },
  { x: 306.4, y: 11.7, tilt: -37.44, width: 40.8, height: 17.6, border: 0.58, font: 8.55 },
  { x: 337.8, y: 52.8, tilt: 8.76, width: 71.5, height: 30.8, border: 1.02, font: 14.98 },
  { x: 449.6, y: 28.4, tilt: 20.52, width: 59.9, height: 25.8, border: 0.86, font: 12.55 },
];

interface HeldCardProps {
  /** Called with true while the pointer or focus is on this card. */
  onHold: (held: boolean) => void;
}

// Hover and focus-within, reported upward. WCAG 2.2.2 (Pause, Stop, Hide): the
// coins on these cards advance on their own, so a reader needs a way to hold
// them still. The rotation is owned by the row because the carousel draws each
// card more than once and every copy must show the same coin.
function useHold(onHold: (held: boolean) => void) {
  const held = useRef(false);
  const set = useCallback(
    (next: boolean) => {
      if (held.current === next) return;
      held.current = next;
      onHold(next);
    },
    [onHold]
  );
  return {
    onMouseEnter: () => set(true),
    onMouseLeave: () => set(false),
    // React's onFocus and onBlur bubble, so these are focus-within.
    onFocus: () => set(true),
    onBlur: () => set(false),
  };
}

interface MemeBoomCardProps extends HeldCardProps {
  /** The coin on show, or null for the Pepe the design draws. */
  spot: MemeSpot | null;
}

// The black card is one centred composition: avatar, chips, heading and pill
// all hang off the middle of the card in the design, so they sit in a 484px
// stage centred in whatever width the slide gets. The cluster then stays
// around the coin rather than spreading toward the corners, and every
// coordinate here is still the one the design uses.
//
// The design drew it for Pepe, with "+1000%" thrown around him. A live coin
// takes his place: its picture in the avatar slot, its own move on every chip,
// and its ticker in the heading. With no coin it is the design's card.
function MemeBoomCard({ spot, onHold }: MemeBoomCardProps) {
  const t = useTranslations("discovery");
  const hold = useHold(onHold);

  // A logo that fails is remembered for the life of this card, which is keyed
  // on the coin, so the disc falls back to the ticker rather than a broken image.
  const [logoBroken, setLogoBroken] = useState(false);
  const artwork = spot ? artworkFor(spot.symbol) : null;
  const logo = spot?.image && !logoBroken ? spot.image : null;

  return (
    <article className={CARD_BOX} style={{ background: PEPE_CARD_SURFACE }} {...hold}>
      <span
        aria-hidden
        className={`${BACKDROP} top-[-112.03px] left-[-32.24%] h-[312.541px] w-[123.74%] bg-[url('/market/next100x-card-rays.svg')]`}
      />

      <div className="pointer-events-none absolute top-0 left-1/2 h-[212px] w-[484px] -translate-x-1/2">
        <span
          aria-hidden
          className={`${BACKDROP} top-0 left-[14px] h-[165px] w-[274px] bg-[url('/market/next100x-pepe-glow.svg')]`}
        />
        {/* The avatar slot: Pepe's own portrait for the editorial card and for
            a live PEPE, the Shiba for a live SHIB, and a disc carrying the
            listing's logo over its ticker for every other coin. */}
        {spot === null || artwork !== null ? (
          <span
            aria-hidden
            className={`${BACKDROP} top-0 left-[194px] h-[94px] w-[97px]`}
            style={{
              backgroundImage: `url('${artwork?.src ?? "/market/next100x-pepe-avatar.svg"}')`,
            }}
          />
        ) : (
          <span
            aria-hidden
            className="absolute top-0 left-[194px] flex size-[94px] items-center justify-center overflow-hidden rounded-full border-[3px] border-white/70 bg-white/15 drop-shadow-[0_6px_18px_rgba(0,0,0,0.3)]"
          >
            <span className="px-2 text-center font-sans text-[18px] leading-none font-semibold tracking-[-0.04em] break-all text-white uppercase">
              {spot.symbol}
            </span>
            {logo === null ? null : (
              <img
                src={logo}
                alt=""
                loading="eager"
                decoding="sync"
                referrerPolicy="no-referrer"
                onError={() => setLogoBroken(true)}
                className="absolute inset-0 size-full object-cover"
              />
            )}
          </span>
        )}

        {GAIN_CHIPS.map((chip) => (
          <span
            key={`${chip.x}-${chip.y}`}
            aria-hidden
            style={{
              left: chip.x,
              top: chip.y,
              width: chip.width,
              height: chip.height,
              borderWidth: chip.border,
              fontSize: chip.font,
              transform: `translate(-50%, -50%) rotate(${chip.tilt}deg) skewX(-1.27deg)`,
            }}
            className={`pointer-events-none absolute flex items-center justify-center rounded-full border-[#dadada] bg-white font-sans font-bold tracking-[-0.08em] ${
              spot === null || spot.up ? "text-[#03df3d]" : "text-[#e5484d]"
            }`}
          >
            {spot?.change ?? "+1000%"}
          </span>
        ))}
      </div>

      {/* The heading and the pill are centred on the card, which is where
          the centred stage puts them too, so they sit in the card's own flow
          instead of inside the stage's fixed 212px. A locale that needs a
          second line of heading then grows the card rather than being cut
          off by it. */}
      <div className={`relative flex flex-col items-center px-6 pt-[86px] ${CARD_FOOT}`}>
        {/* max-w-full because the heading is a flex item centred on the cross
            axis, which otherwise sizes to its longest word and hangs off both
            sides of the card. With the cap in place break-words can do its job. */}
        <h3 className="max-w-full text-center font-serif text-[28px] leading-[41px] font-medium tracking-[-2.36px] break-words text-white">
          {spot === null
            ? t("pepeTitle")
            : t(spot.up ? "memeBoomTitle" : "memeCoolTitle", { symbol: spot.symbol })}
        </h3>
        <DiscoveryCta
          href={spot?.href ?? "/meme"}
          label={spot === null ? t("pepeCta") : t("memeBuy", { symbol: spot.symbol })}
          tone="light"
          size={14}
          icon={
            <span
              aria-hidden
              className="size-[14.43px] shrink-0 bg-[url('/market/next100x-icon-coins.svg')] bg-[length:12.93px_12.93px] bg-center bg-no-repeat"
            />
          }
          padding={CTA_PADDING}
          className={`mt-[11px] min-w-[125px] tracking-[-0.56px] ${CTA_SURFACE}`}
        />
      </div>
    </article>
  );
}

// Artwork the design ships for one named coin.
//
// The Shiba is the drawing the card was designed around and the Pepe avatar is
// the one already drawn for the sibling slide. Both are committed Figma exports,
// so a coin the design has art for gets that art instead of a generic disc, and
// the dog now rides the rotation rather than only standing in for it.
interface MemeArtwork {
  src: string;
  /** The drawing's own box. The slot keeps its proportions from these. */
  width: number;
  height: number;
  /** True when the drawing already carries the rising arrow, so it is not doubled. */
  drawsArrow: boolean;
  /**
   * True when the drawing is cut off at the foot of its own box, which reads
   * right only when that cut sits on the card's bottom edge.
   */
  bleedsToFoot: boolean;
}

// The dog the card was designed around. He is both the editorial slot in the
// rotation and what a live SHIB would draw, so he is declared once and used in
// both places rather than kept in step by hand.
//
// He already stands on the rising arrow in his own drawing, and he is cut off at
// the foot of his box so that the cut can sit on the card's bottom edge.
const SHIBA_ARTWORK: MemeArtwork = {
  src: "/market/next100x-shiba.svg",
  width: 255,
  height: 212,
  drawsArrow: true,
  bleedsToFoot: true,
};

// Keyed by ticker, upper case. Symbols arrive from an upstream listing in
// whatever case that listing uses, so the lookup normalises before it reads.
//
// The trending feed is a new-listing and pump feed and carries neither of these
// today, so on the normal path this map answers for nothing. It is here for the
// reserved slots the adapter fills when a real SHIB or PEPE does come through,
// and it is the reason the dog is not the only drawing this card can hold.
const MEME_ARTWORK: Readonly<Record<string, MemeArtwork | undefined>> = {
  SHIB: SHIBA_ARTWORK,
  // The avatar already drawn for the sibling Pepe slide: a self-contained round
  // portrait, so it reads as a coin's picture without a disc around it.
  PEPE: {
    src: "/market/next100x-pepe-avatar.svg",
    width: 97,
    height: 94,
    drawsArrow: false,
    bleedsToFoot: false,
  },
};

function artworkFor(symbol: string): MemeArtwork | null {
  return MEME_ARTWORK[symbol.toUpperCase()] ?? null;
}

// The file each coin paints, so every one of them can be preloaded before the
// rotation reaches it. Bespoke art wins over the listing's logo.
function sourceFor(spot: MemeSpot): string | null {
  return artworkFor(spot.symbol)?.src ?? spot.image;
}

// The slot the artwork stands in: the Shiba's own drawn 255x212, anchored to the
// bottom left corner of the card. Every coin gets this slot, so a live coin's
// medallion is drawn as large as the dog rather than as a smaller disc beside
// the same heading.
//
// The width is capped at the drawing's own 255 and otherwise takes what the copy
// leaves, plus the overlap the artboard itself draws. The arithmetic:
//
//   copy block   242px of column plus its 16px right margin  = 258px
//   artboard     484px card less its 1.03px edge either side = 481.94px
//   overlap      255 + 258 - 481.94                          = 31.06px
//
// So the design's own composition already spends 31px of overlap: the dog's slot
// runs to 255 and the headline box starts at 252. Holding that figure rather
// than driving it to zero is what keeps the artboard's geometry exact. A card at
// or above the artboard's 484 gets the drawing at 255; below it the slot gives
// way so that the overlap never grows past the artboard's, because the copy
// carries the coin's name and its move and the artwork is decoration. It gives
// way only down to the floor below, and is not drawn at all under it.
//
// `min()` rather than a container query, so there is no breakpoint to keep in
// step with the copy's width and nothing that can resolve against the wrong
// container. The percentage is of the card's padding box, which is the same box
// the copy's own `max-w` is measured against.
//
// The ratio is the drawing's, so a narrow card gets a smaller dog and never a
// squashed one. It cannot do to the card's height what it did before: the width
// is capped at 255, and the slot is out of flow, so it contributes no height at
// any width. Card height is the copy block's business alone.
//
// `bottom-0` is measured from the card rather than from the copy. The Shiba is
// cut off at the foot of his box, and that cut only reads as the dog standing
// behind the card once it sits on the card's bottom edge, including on a locale
// whose wrapped heading has pushed the card past the floor.
//
// It is also the slot the arrow is measured in, which is why it is a container.
//
// Below 327.05px of card the slot is not drawn at all. See ART_HIDDEN_BELOW_FLOOR.
const ART_STAGE =
  "@container pointer-events-none absolute bottom-0 left-0 aspect-[255/212] w-[min(255px,calc(100%-226.94px))]";

// The card width at which the artwork stops being drawn, and the queries that
// read it.
//
// The slot above shrinks without a floor, so on a narrow card it keeps handing
// back a smaller drawing until the drawing is a chip. The figure below is where
// that has to stop, and it is derived rather than chosen: it is the width at
// which the disc's right edge meets the copy column's left edge.
//
//   disc right   3.137cqw + 65.836cqw of the slot            = 0.68973 * slot
//   slot         the formula above, below its 255px cap      = width - 226.94
//   copy left    the 242px column and its 16px margin        = width - 258
//
//   0.68973 * (width - 226.94) = width - 258   ->   width = 327.05
//
// Above it the whole picture stands in space the copy does not claim. Below it
// the disc starts printing into the column, and since the disc grows upward from
// the card's foot, a disc that is into the column is a disc that is into the
// heading. That is the overlap the redesign already had to fix once, so the line
// is drawn where it stops being possible rather than where it starts to look bad.
//
// It lands in the same place as legibility, arrived at separately: the ticker is
// 20% of the disc inside its border, so a card at the floor sets it at 12px and
// any narrower card sets it smaller than that.
//
// So below the line the card carries no picture. It is not a smaller picture,
// because there is no room for one that is both clear of the copy and legible;
// it is the gradient, the two ray bursts and the copy, and the copy takes the
// width the artwork is no longer using. A card that reads as a copy-only variant
// is a card, and a 65px chip in the corner is a bug report.
//
// A container query rather than arithmetic in the width, because "the picture is
// not drawn here" is a different statement from "the picture is this wide" and
// should read as one. It is measured on the card, which is what the slot's own
// percentage is measured against, so the two agree whatever width the carousel
// hands over: the card is a container for this, and the query is answered by the
// card rather than by the carousel frame it sits in.
//
// The 327.05 is written out at each use rather than composed from a constant.
// Tailwind reads class names as literal text out of the source, and a class
// built from a template string is a class it never generates.
const ART_HIDDEN_BELOW_FLOOR = "@max-[327.05px]:hidden";

// The rising arrow, drawn behind the coin the way the design draws it behind the
// dog.
//
// Exported from the Shiba group in Figma as its own asset, so a coin that is up
// carries the same arrow the dog does rather than a second drawing of one. The
// export stands upright; inside the Shiba the same shape is scaled by 1.0406 and
// leant 8.438 degrees, and the box below is that transform written out against
// the slot's own 255x212. So the arrow lands where the design puts it at the
// size the design draws it, and because the slot is identical for every coin the
// arrow is identical for every coin.
//
// It runs past the slot on the left and below it, exactly as it does on the
// artboard, and the card's `overflow-hidden` makes the same cut the artboard
// does.
//
// Measured in the slot's own width rather than in pixels, so it rides with the
// slot: on a card too narrow for the drawing at 255 the arrow comes down with
// the coin instead of standing at its full size over a smaller one. Each figure
// is the design's pixel over the slot's 255, so at full size the four resolve to
// -2.24, 60.43, 244.94 and 246.13 exactly.
const ARROW_SRC = "/market/next100x-arrow-up.svg";
const ARROW_WIDTH = 235.393;
const ARROW_HEIGHT = 236.533;
const ARROW =
  "pointer-events-none absolute top-[23.698cqw] left-[-0.878cqw] h-[96.522cqw] w-[96.055cqw] max-w-none origin-top-left rotate-[8.438deg]";

// The coin's picture and nothing else: the disc, or a self-contained portrait
// like the Pepe avatar. It takes the slot whole and the picture inside takes the
// slot's full height, so every coin is drawn as tall as the dog and its width
// follows its own drawing.
const COIN_BOX = "relative flex h-full w-full items-center justify-center";

// The same box for art the design cuts off at the foot of its own drawing, which
// is bottom aligned rather than centred so that the cut sits on the card's
// bottom edge.
const COIN_BOX_TO_FOOT = "relative flex h-full w-full items-end justify-center";

// The disc a coin without bespoke art gets, drawn at the dog's footprint rather
// than at the slot's full height.
//
// The arrow reads on the artboard because the dog is dog shaped: it leaves him
// on the right and sweeps into the top right corner, where nothing is drawn over
// it. A circle hides far more than that silhouette does, and a disc at the
// slot's full height is a circle 212 across in a slot 255 wide, sitting over
// exactly the corner the arrow was escaping into. Measured on a rendered card,
// the arrow paints 8282px inside it and the old disc left 601 of them showing,
// 7.3%. That is the tail and a sliver of the head, which is not a rising signal.
//
// So the disc is given the dog's own footprint instead:
//
//   diameter  the dog's drawn area, 22135px, as a circle  = 167.88px, 65.836cqw
//   left      8px, 3.137cqw, which puts its right edge on 175.9, where the
//             dog's own profile runs through the heights the arrow crosses
//   bottom    the slot's foot, where the dog is cut off
//
// That leaves 4398px showing, 53.1%, against the 57.8% the dog himself leaves.
// The remainder is the disc's own drop shadow dimming the arrow around its rim.
// So the arrow is not moved at all: it keeps the design's size, lean and offset,
// and stays behind the picture. The disc also keeps the dog's ink rather than
// his bounding box, so a coin the design ships no drawing for is still drawn as
// large as he is.
//
// Only the disc. Bespoke art is a drawing with a silhouette of its own and the
// artboard already accounts for it: the Pepe portrait at the slot's full height
// leaves 98.1% of the arrow showing, because the arrow's ribbon runs just
// outside the portrait's rim. Moving that one would take legibility away, so
// COIN_BOX above is untouched and every drawing keeps the design's composition.
//
// Sized in the slot's own width for the same reason the arrow is, so the disc
// and the arrow ride the slot together and the composition holds at every card
// width rather than only at the artboard's. `cqw` here resolves against the
// slot, not against this element: an element is never its own query container.
const MEDALLION =
  "@container absolute bottom-0 left-[3.137cqw] flex aspect-square h-[65.836cqw] items-center justify-center overflow-hidden rounded-full border-[3px] border-white/70 bg-white/15 drop-shadow-[0_6px_18px_rgba(0,0,0,0.3)]";

interface MemeArtProps {
  /** Bespoke art for this coin, or null when the design ships none. */
  artwork: MemeArtwork | null;
  /** The listing's logo, or null when it has none or its logo has already failed. */
  logo: string | null;
  /** Stands in for the logo when there is neither art nor a logo that loads. */
  symbol: string;
  /** Only a coin that is up gets the rising arrow. */
  up: boolean;
  onLogoError: () => void;
}

// Artwork for one coin: the drawing the design ships for it, else its logo, else
// its ticker set in the card's own type. Decorative in every case, because the
// coin's name is already the heading beside it.
//
// The ticker is painted first and the logo sits over it, so the disc is never
// blank while a logo is still on the wire and never an empty frame if that logo
// turns out not to be an image.
function MemeArt({ artwork, logo, symbol, up, onLogoError }: MemeArtProps) {
  const bleeds = artwork?.bleedsToFoot === true;

  return (
    <span aria-hidden className={`${ART_STAGE} ${ART_HIDDEN_BELOW_FLOOR}`}>
      {/* An img rather than a background, so "this coin is drawn as rising" is
          a claim the accessible tree can be asked about. alt="" keeps it
          decorative, which is what it is: the heading beside it already says
          the coin is up. First in the slot, so it sits behind the picture the
          way the design sits it behind the dog. */}
      {up && artwork?.drawsArrow !== true ? (
        <img
          src={ARROW_SRC}
          alt=""
          width={ARROW_WIDTH}
          height={ARROW_HEIGHT}
          loading="eager"
          decoding="sync"
          className={ARROW}
        />
      ) : null}

      <span className={bleeds ? COIN_BOX_TO_FOOT : COIN_BOX}>
        {artwork === null ? (
          <span className={MEDALLION}>
            {/* Container units, so the ticker keeps the same share of the disc at
                every size the disc takes. break-all rather than truncate, because
                a ticker that loses its tail is the half that tells two coins
                apart. */}
            <span className="px-[8cqw] text-center font-sans text-[20cqw] leading-none font-semibold tracking-[-0.04em] break-all text-white uppercase">
              {symbol}
            </span>
            {logo === null ? null : (
              // A plain img, not next/image: the logo host is whatever the
              // upstream listing points at, and next/image would need every one of
              // those hosts allowlisted in the Next config before it rendered at
              // all. object-cover so a logo that is not square fills the disc
              // instead of sitting in a letterboxed band. no-referrer because the
              // host is a third party with no business being told which page of
              // ours the user is on.
              <img
                src={logo}
                alt=""
                loading="eager"
                fetchPriority="high"
                decoding="sync"
                referrerPolicy="no-referrer"
                onError={onLogoError}
                className="absolute inset-0 size-full object-cover"
              />
            )}
          </span>
        ) : (
          <img
            src={artwork.src}
            alt=""
            width={artwork.width}
            height={artwork.height}
            loading="eager"
            fetchPriority="high"
            decoding="sync"
            className={
              bleeds ? "h-full w-full object-contain object-bottom" : "h-full w-auto object-contain"
            }
          />
        )}
      </span>
    </span>
  );
}

interface MemeSpotCardProps extends HeldCardProps {
  /** The coin on show, or null for the Shiba the design draws. */
  spot: MemeSpot | null;
}

// The orange card. The artwork holds the bottom left corner at the size the
// design draws it and the copy holds the right edge at the width the design
// gives it, with the two ray bursts reaching both edges behind them.
//
// Neither one is sized from the slide. On a slide the width of the artboard the
// pair is the artboard; on a wider one the extra width is orange between them.
//
// A live coin gets its own heading, its own figure and its own artwork. With
// none it shows the Shiba the design was drawn with, which is the same drawing
// a live SHIB gets. He carries the design's own line and no figure: the
// illustration is editorial, so there is no move to report.
function MemeSpotCard({ spot, onHold }: MemeSpotCardProps) {
  const t = useTranslations("discovery");
  const hold = useHold(onHold);

  // A logo that fails is remembered for the life of this card, which is keyed
  // on the coin, so the disc falls back to the ticker rather than a broken image.
  const [logoBroken, setLogoBroken] = useState(false);
  const logo = spot?.image && !logoBroken ? spot.image : null;

  // The pictures this card needs are fetched up front, so a swap paints
  // something already in cache instead of leaving a gap until it lands. React
  // dedupes these, so calling them on each render costs one link tag per URL.
  preload(SHIBA_ARTWORK.src, { as: "image" });
  preload(ARROW_SRC, { as: "image" });
  if (spot !== null) {
    const source = sourceFor(spot);
    if (source !== null) preload(source, { as: "image" });
  }

  // The editorial slot draws the Shiba. A live coin draws whatever the design
  // ships for its ticker, and the medallion when it ships nothing.
  const artwork = spot === null ? SHIBA_ARTWORK : artworkFor(spot.symbol);

  return (
    <article
      // `@container` only on this card, and not in CARD_BOX, because only this
      // one carries the artwork the floor applies to. The black card is a fixed
      // composition on a centred stage and has nothing to answer a query with.
      className={`${CARD_BOX} @container`}
      style={{ background: MEME_CARD_SURFACE }}
      {...hold}
    >
      <span
        aria-hidden
        className={`${BACKDROP} top-[-112.28px] left-[-31.44%] h-[312.541px] w-[143.64%] bg-[url('/market/next100x-sunburst.svg')]`}
      />
      <span
        aria-hidden
        className={`${BACKDROP} top-[-150.04px] left-[-14.35%] h-[355.89px] w-[133.99%] bg-[url('/market/next100x-sun-rays.svg')]`}
      />

      <MemeArt
        artwork={artwork}
        logo={logo}
        symbol={spot?.symbol ?? ""}
        // The editorial slot claims no direction: its line reports no move, so
        // there is nothing here to call up. The dog's own drawing carries the
        // arrow regardless, which is why he still reads as rising.
        up={spot?.up ?? false}
        onLogoError={() => setLogoBroken(true)}
      />

      {/* The design's 242px column, held against the card's right edge by its
          own margin rather than laid out beside the artwork. The two are
          anchored to opposite corners, so a slide wider than the artboard puts
          its extra width in the orange between them and neither the drawing nor
          the column changes size.
          `max-w` is the backstop for a slide narrower than the column plus its
          margins, where the column gives way instead of hanging off the card.
          The vertical padding is the design's: English lands on its 57px top,
          and a locale that wraps the heading to a third line grows the card.
          Below the artwork's floor the column takes the width the picture is no
          longer using, so the narrow card is a copy card rather than a copy
          column shoved against the right edge of an empty one. It only ever
          widens, so it cannot be what pushes a heading onto another line. */}
      <div
        className={`relative mr-4 ml-auto w-[242px] max-w-[calc(100%-2rem)] pt-[57px] @max-[327.05px]:w-[calc(100%-2rem)] ${CARD_FOOT}`}
      >
        <h3 className="font-sans text-[30px] leading-[33.7px] font-medium tracking-[-2.5px] break-words text-white">
          {spot ? (
            <>
              {/* The ticker, not the listing's name. The ticker is the whole
                  identity of a coin on a card this size, and the names the
                  trending feed carries run from a word to a sentence. */}
              {t(spot.up ? "memeUpTitle" : "memeDownTitle", { name: spot.symbol })}
              {/* The move gets its own line rather than being folded into the
                  sentence. It arrives already signed, so a template that also
                  said "up" or "down" would either repeat the plus or argue with
                  the minus. On its own line the sign is the figure's, not the
                  sentence's. */}
              <span className="tnum block">{spot.change}</span>
            </>
          ) : (
            t("shibaTitle")
          )}
        </h3>
        <DiscoveryCta
          href={spot?.href ?? "/meme"}
          label={t("shibaCta")}
          tone="light"
          size={14}
          icon={
            <span
              aria-hidden
              className="size-[14.43px] shrink-0 bg-[url('/market/next100x-icon-chart.svg')] bg-[length:11.72px_11.72px] bg-center bg-no-repeat"
            />
          }
          padding={CTA_PADDING}
          className={`mt-3 min-w-[142px] tracking-[-0.56px] ${CTA_SURFACE}`}
        />
      </div>
    </article>
  );
}

// The featured coin holds for this long before the next one takes the row.
const MEME_HOLD_MS = 10_000;

// "Find the next 100X": the memecoins the desk is watching, one coin to a
// card. Every card leads to the meme desk, which is the only place any of
// them can actually be traded.
//
// The cards ride a carousel. The row deals up to three coins from the featured
// one on, black card, orange card, black card, so a step through the carousel
// is a step through the ranking rather than the same coin seen twice. Every
// ten seconds the featured coin advances and every card moves one place with
// it. With no coins it is the design's own pair: Pepe, the Shiba, and Pepe
// again so the loop has three slides.
export function Next100xRow({ memecoins = [] }: { memecoins?: readonly MemeSpot[] }) {
  const t = useTranslations("discovery");

  // The holds are counted rather than flagged. The row draws several cards,
  // and a pointer and a focus can rest on them at once, so the rotation
  // restarts only when the last of them has left.
  const holds = useRef(0);
  const [paused, setPaused] = useState(false);
  const onHold = useCallback((held: boolean) => {
    holds.current = Math.max(0, holds.current + (held ? 1 : -1));
    setPaused(holds.current > 0);
  }, []);

  const featured = useRotatingIndex(memecoins.length, { intervalMs: MEME_HOLD_MS, paused });

  // Up to three coins, each once. Two coins deal two cards, one coin one.
  const dealt = memecoins
    .slice(0, 3)
    .map((_, offset) => memecoins[(featured + offset) % memecoins.length]);

  const cards =
    dealt.length > 0
      ? dealt.map((coin, slot) =>
          slot % 2 === 0 ? (
            <MemeBoomCard key={coin.symbol} spot={coin} onHold={onHold} />
          ) : (
            <MemeSpotCard key={coin.symbol} spot={coin} onHold={onHold} />
          )
        )
      : [
          <MemeBoomCard key="pepe" spot={null} onHold={onHold} />,
          <MemeSpotCard key="shiba" spot={null} onHold={onHold} />,
          <MemeBoomCard key="pepe-again" spot={null} onHold={onHold} />,
        ];

  return (
    <DiscoveryRow
      title={t.rich("next100xTitle", {
        hot: (chunks) => <span className="text-[#ddb4fd]">{chunks}</span>,
      })}
      href="/meme"
    >
      {cards.length > 1 ? (
        <Carousel label={t("next100xCarousel")} trimPx={50}>
          {cards}
        </Carousel>
      ) : (
        // One slide, so it is given the whole frame rather than half of one
        // with a gutter where the next would have been.
        <Carousel label={t("next100xCarousel")} perView={1} peek={0}>
          {cards}
        </Carousel>
      )}
    </DiscoveryRow>
  );
}
