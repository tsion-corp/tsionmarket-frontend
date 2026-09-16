"use client";

import { useEffect, useState } from "react";
import { DiscoveryCta } from "@/features/discovery/components/discovery-cta";

// The chrome every card on the "Join the Conversation" band shares: a 203px
// article with an 18px radius and a two-stop gradient, decorative art across
// the top, and a row hung off the bottom edge that pairs a kicker and a
// headline on the left with a column of two pills on the right. The chess room
// card drew it first; the other cards are this frame in their own hue with
// their own motif where the chess card scatters faces.
//
// Everything decorative is `pointer-events-none` and sits under the copy row,
// so the two pills are always the thing under the pointer. A card is a doorway
// and its links must work.

/** Illustration layers are decorative: no alt text, never a click. */
export const artLayer = "pointer-events-none absolute select-none";

// The design draws every card 482px wide, but each gets a carousel slide out of
// a 1456px column, so roughly 690px. Nothing horizontal may be pinned at a
// design pixel or it drifts to an edge as the card grows: every x offset is a
// share of the card instead. Vertical offsets stay in pixels because the card
// keeps the height it was drawn at.
export const CARD_WIDTH = 482;

/** A design x offset, as the percentage of the card it sits at. */
export function across(x: number): string {
  return `${((x / CARD_WIDTH) * 100).toFixed(4)}%`;
}

/** The member scatter is laid out inside its own 408px box. */
const CLUSTER_WIDTH = 408;

interface ClusterPiece {
  /**
   * The committed export this slot draws when no live member reaches it. The
   * two mic discs always draw theirs: they are furniture, not members.
   */
  fallback: string;
  /** Square in every case: the photos are circles and the badges are discs. */
  size: number;
  /** Inside the 408x83 box the cluster is centred on, in design pixels. */
  left: number;
  top: number;
  tilt: number;
  /** A member photo, so it is masked to a circle. The badges ship their frame. */
  photo?: boolean;
  /** Only the large face is drawn with a dark rim. */
  outlined?: boolean;
  shadow?: string;
}

// The scatter of members across the top of a people card. Order is the design's
// paint order, so a face laid over a badge stays over it. The two mic discs sit
// between the small faces and the large one.
const FACE_CLUSTER: ClusterPiece[] = [
  {
    fallback: "/market/convo-avatar-1.png",
    size: 30.551,
    left: 253.22,
    top: 3.65,
    tilt: -16.19,
    photo: true,
    shadow: "0 4.155px 2.078px rgba(0,0,0,0.3)",
  },
  {
    fallback: "/market/convo-avatar-2.png",
    size: 30.551,
    left: 36.69,
    top: -2.31,
    tilt: 11.28,
    photo: true,
    shadow: "0 4.155px 2.078px rgba(0,0,0,0.3)",
  },
  {
    fallback: "/market/convo-avatar-3.png",
    size: 28.295,
    left: 57.4,
    top: 48.4,
    tilt: -16.31,
    photo: true,
    shadow: "0 2.881px 1.44px rgba(0,0,0,0.3)",
  },
  {
    fallback: "/market/convo-avatar-badge-large.svg",
    size: 36.451,
    left: 228.46,
    top: 47.62,
    tilt: -21.2,
  },
  {
    fallback: "/market/convo-avatar-badge-small.svg",
    size: 26.64,
    left: 125.69,
    top: 31.82,
    tilt: 19.08,
  },
  {
    fallback: "/market/convo-avatar-4.png",
    size: 88.38,
    left: 304.64,
    top: -12.36,
    tilt: 14.47,
    photo: true,
    outlined: true,
    shadow: "0 6.769px 6.769px rgba(0,0,0,0.3)",
  },
  {
    fallback: "/market/convo-avatar-5.png",
    size: 30.551,
    left: -9,
    top: 45,
    tilt: 0,
    photo: true,
    shadow: "0 4.155px 2.078px rgba(0,0,0,0.3)",
  },
  {
    fallback: "/market/convo-avatar-3.png",
    size: 51.524,
    left: 162.36,
    top: -5.64,
    tilt: 13.67,
    photo: true,
    shadow: "0 5.246px 2.623px rgba(0,0,0,0.3)",
  },
];

// The photo for each of the eight slots, in paint order, for one room.
//
// The choreography is fixed: eight pieces at sizes, offsets and tilts the
// design drew, six of them faces. A live room supplies whatever member photos
// it has, which is rarely six, so the list wraps: a three-member room draws its
// three faces twice rather than leaving three empty discs in the middle of the
// composition. The design already repeats a face itself, so a repeat reads as
// the scatter it was drawn as. Members past the sixth are not drawn.
//
// An empty list keeps every committed photo, which is the card the design draws
// and the one the tests render.
function scatterSources(avatars: readonly string[]): string[] {
  let member = 0;
  return FACE_CLUSTER.map((piece) => {
    if (!piece.photo || avatars.length === 0) return piece.fallback;
    const src = avatars[member % avatars.length];
    member += 1;
    return src;
  });
}

/**
 * The scatter of member faces across the top of a card. The box spreads with
 * the card rather than clumping at the left, so it is proportional while the
 * faces keep the size they were drawn at.
 */
export function FaceScatter({ avatars }: { avatars: readonly string[] }) {
  const sources = scatterSources(avatars);
  return (
    <div className="absolute top-[9px] h-[83px]" style={{ left: across(37), right: across(37) }}>
      {FACE_CLUSTER.map((piece, slot) => (
        <img
          // Keyed by the slot, not by the photo in it. The photo changes with
          // the room, and a key that changed with it would tear the scatter
          // down and rebuild it on every advance rather than swapping a src.
          key={piece.left}
          src={sources[slot]}
          alt=""
          aria-hidden
          // A member's photo is a remote URL and can fail. The committed face
          // takes the slot when it does, so a dead link is a face nobody
          // recognises rather than a hole in the middle of the composition.
          // Guarded on the attribute rather than on `src`, which reads back
          // absolute, so a committed photo that fails cannot loop.
          onError={(event) => {
            const image = event.currentTarget;
            if (image.getAttribute("src") !== piece.fallback) image.src = piece.fallback;
          }}
          width={Math.round(piece.size)}
          height={Math.round(piece.size)}
          style={{
            left: `${((piece.left / CLUSTER_WIDTH) * 100).toFixed(4)}%`,
            top: piece.top,
            width: piece.size,
            height: piece.size,
            transform: `rotate(${piece.tilt}deg)`,
            boxShadow: piece.shadow,
          }}
          className={`${artLayer} ${piece.photo ? "rounded-full object-cover" : ""} ${
            piece.outlined ? "border-[2.389px] border-[#1e2022]" : ""
          }`}
        />
      ))}
    </div>
  );
}

/**
 * The star dust the chess card's art carries, for the cards that have no art
 * export of their own: a sparse field of soft points, so every card reads as
 * the same night sky in a different colour.
 */
export function Dust() {
  return (
    <div
      aria-hidden
      className={`${artLayer} inset-0 opacity-60`}
      style={{
        backgroundImage:
          "radial-gradient(circle, rgba(255,255,255,0.7) 0.9px, transparent 1.6px), radial-gradient(circle, rgba(255,255,255,0.45) 0.7px, transparent 1.4px)",
        backgroundSize: "53px 41px, 37px 59px",
        backgroundPosition: "7px 11px, 23px 29px",
      }}
    />
  );
}

export interface PillLink {
  href: string;
  label: string;
  /** Trailing glyph, sized by the caller. */
  icon: React.ReactNode;
  /** A sibling deployment, opened beside the app in a new tab. */
  external?: boolean;
}

/**
 * The handlers a card on this band spreads to report itself held.
 *
 * WCAG 2.2.2 (Pause, Stop, Hide): the row advances the chess and square cards
 * on a timer, and a reader needs a way to hold them still. Hovering or focusing
 * any card on the band is that way, so every card reports, not just the ones
 * that rotate. `onFocus` and `onBlur` are focusin and focusout in React, so
 * focus anywhere inside the card counts rather than only on the card itself.
 */
export function useHoldReport(onHold?: (held: boolean) => void) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const held = hovered || focused;

  useEffect(() => {
    if (!held || !onHold) return;
    onHold(true);
    // Released when the pointer leaves, when focus goes, and when the card
    // unmounts. A hold that outlived its card would stop a rotation for good.
    return () => onHold(false);
  }, [held, onHold]);

  return {
    onMouseEnter: () => setHovered(true),
    onMouseLeave: () => setHovered(false),
    onFocus: () => setFocused(true),
    onBlur: () => setFocused(false),
  };
}

export interface ConversationCardProps {
  /** The card's two-stop gradient, as a Tailwind background class. */
  gradient: string;
  /** Decorative layers, drawn under the copy. Each must be pointer-events-none. */
  art?: React.ReactNode;
  kicker: { icon: React.ReactNode; label: string };
  headline: string;
  /**
   * The one thing the card does. Every card on these bands ends in a single
   * pill: two pills asked the reader to choose before they had read the card,
   * and the row is a set of doorways, not a menu.
   */
  action: PillLink;
  /** Reports the card holding a rotation still, for a card whose content advances on its own. */
  onHold?: (held: boolean) => void;
}

/**
 * The frame every card on the band renders through.
 *
 * The copy row hangs off the bottom, not the top. The design puts it at y=103
 * with a 78.45px pill stack under it, so 21.553px is the gap it leaves to the
 * card's bottom edge, and anchoring there reproduces y=103 exactly for as long
 * as the stack is the height it was drawn at. It stops reproducing it the
 * moment a pill takes a second line, and that is the point: the row grows
 * upward into the card instead of down through the edge.
 */
export function ConversationCard({
  gradient,
  art,
  kicker,
  headline,
  action,
  onHold,
}: ConversationCardProps) {
  const hold = useHoldReport(onHold);

  return (
    <article className={`relative h-[203px] overflow-hidden rounded-[18px] ${gradient}`} {...hold}>
      {art}
      {/* On a phone the copy stands under its own full width, which brings it
          up into the art. A scrim carries it: the art still reads at the top
          of the card, the words sit on something dark enough to be read, and
          from md the copy is back in its own column beside the art and the
          scrim is not needed. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[78%] bg-[linear-gradient(to_top,rgba(0,0,0,0.88)_0%,rgba(0,0,0,0.72)_38%,rgba(0,0,0,0.4)_68%,transparent_100%)] md:hidden"
      />

      {/* Copy on the left, pills on the right, both inside the band the design
          rules between x=44.32 and the far edge less 34, and above every art
          layer so nothing decorative can sit between a pointer and a pill.
          They share one row so the two can negotiate: the pills take what
          their longest label needs and the copy keeps the rest, up to the
          width it is drawn at. The gap is 18px rather than the design's 12px:
          12px is enough between "grandmaster" and "Join Space", and not enough
          between a German headline that fills its column and a pill that has
          grown to hold "Space beitreten". */}
      <div
        className="absolute bottom-[21.553px] z-[1] flex flex-col items-start gap-[10px] md:flex-row md:items-start md:justify-between md:gap-[18px]"
        style={{ left: across(44.32), right: across(34) }}
      >
        {/* The design draws this column at 227.37px, 56.3245% of the band; the
            cap is 62% so the Spanish and Portuguese headlines keep their two
            lines at the widths the card is actually rendered at. The 2.32px is
            the copy sitting that much lower than the pills. */}
        <div className="mt-[2.32px] w-full min-w-0 flex-1 md:max-w-[62%]">
          <p className="flex items-center gap-[4.878px] font-serif text-[10px] leading-[1.2] font-semibold text-white md:text-[11px]">
            {kicker.icon}
            {/* The kicker wraps to a second line before it gives up any of
                itself; an ellipsis there would be the name with its second
                word cut. */}
            <span className="line-clamp-2">{kicker.label}</span>
          </p>
          {/* Two lines then an ellipsis, as drawn. The clamp keeps the row's
              top clear of the art above it, which ends 93px down. The design
              draws the headline at 23px on a 482px card; a phone's card is
              narrower and the same words at that size ran to the clamp, so
              below md it steps down to 17px. */}
          <h3 className="mt-[9.34px] line-clamp-2 font-serif text-[17px] leading-[1.1] font-bold text-white md:text-[23px]">
            {headline}
          </h3>
        </div>

        {/* One pill, at the size the prediction row's "Predict Now" is drawn:
            the same 15px label in the same 20.571 by 12.857 gutters, so the
            bands read as one set rather than three sizes of button.
            A phone's card is a third of that width, where the two could not
            share a row: the pill took half the card, wrapped its label over
            two lines, and left the headline three words and an ellipsis. Below
            md the copy takes the full width and the pill sits under it, at
            13px in 14 by 9. */}
        <div className="flex max-w-full shrink-0 items-center md:max-w-[66%]">
          <DiscoveryCta
            href={action.href}
            label={action.label}
            tone="light"
            size={15}
            sizeClassName="text-[13px] md:text-[15px]"
            external={action.external}
            padding="px-[14px] py-[9px] md:px-[20.571px] md:py-[12.857px]"
            className="tracking-[-0.15px]"
            icon={action.icon}
          />
        </div>
      </div>
    </article>
  );
}

/** The small square icon beside a kicker, sized as the design draws it. */
export function KickerIcon({ src }: { src: string }) {
  return (
    <img
      src={src}
      alt=""
      aria-hidden
      width={15}
      height={15}
      className="size-[14.634px] shrink-0 rounded-[3.659px] object-cover"
    />
  );
}

/** A kicker glyph for a card with no icon export: one character in a small disc. */
export function KickerGlyph({ glyph }: { glyph: string }) {
  return (
    <span
      aria-hidden
      className="grid size-[14.634px] shrink-0 place-items-center rounded-[3.659px] bg-white/15 text-[9px] leading-none text-white"
    >
      {glyph}
    </span>
  );
}
