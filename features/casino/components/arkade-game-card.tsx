"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import type { CasinoGame } from "@/features/casino/lib/games";

/**
 * One Arkade catalogue card, as the comp draws it: a 204px frame at the 20px
 * corner, cover art under a two layer scrim, a white badge pill top left, and
 * the game's name, one-liner and action pinned 16px in from the bottom corners.
 *
 * The phone list (node 12:204) and the desktop rail (node 173:47144) draw the
 * same card; only the footprint changes, from a third of a row to the whole
 * width. It was transcribed once per surface, which is what this file replaces.
 *
 * Presentational. It never navigates and never reports: activating a playable
 * card calls `onActivate`, and the surface that owns the card decides what that
 * means. See the analytics note on `surface` below.
 */

// The phone and the desktop draw the same card, but the two transcriptions
// drifted before they were merged here, and this extraction is a refactor: it
// keeps both surfaces pixel for pixel. `surface` selects between them.
//
// Two of the differences are deliberate. The phone navigates with a real
// anchor, so a long press and an open-in-new-tab work on a touch device, and it
// hangs its analytics call on that anchor's onClick. The desktop card is a
// button that hands the game back to the route, which owns both the router push
// and the analytics call. Neither path lives in this file, so the card can
// neither swallow the event nor grow a second copy of the catalogue's id map.
//
// The rest is drift, reported for a ruling rather than quietly resolved here:
// the phone's badge is 30px tall at 13px where the desktop's is 24px at 12px,
// its action pill is 36px at 12px where the desktop's is 33.5px at 11.5px, it
// clamps a long one-liner to two lines where the desktop lets it run, and it
// sets the copy 12px off the pill where the desktop sets it 16px. The comp
// draws a 30px badge and a 36px pill, so the phone is the accurate one.
export type ArkadeCardSurface = "phone" | "desktop";

// The card frame. ws-card carries the 5% fill, the 12% hairline and the inset
// top light; rounded-card overrides its 22px radius down to the design's 20px.
// Exported so a surface can shape its loading placeholder like a real card.
//
// Neither `block` nor `text-left` belongs here. A link needs `block`, since an
// inline anchor would sit on a line box and leave a descender gap under the
// card. A button is already inline-block and must stay that way, because adding
// `block` to it moves the desktop rail; it needs `text-left` instead, to undo
// the centring a button applies to its own content.
export const ARKADE_CARD_FRAME = "ws-card rounded-card relative h-[204px] w-full overflow-hidden";

// The comp's legibility treatment, two layers rather than one colour, which is
// why it lives here instead of in a token. A vertical wash sinks the bottom of
// the art to black, and a 153.72deg diagonal darkens the corner the title and
// the one-liner sit in.
const SCRIM_VERTICAL = "linear-gradient(rgba(0,0,0,0.1), rgba(0,0,0,0.35) 45%, #000)";
const SCRIM_DIAGONAL = "linear-gradient(153.72deg, #000 0%, rgba(10,10,10,0) 60%)";

// The action pill, bottom right: the brushed chrome of ws-chrome-pill dropped
// to 20% alpha so the artwork reads through it, which the opaque utility cannot
// express, plus the comp's white edge and top light. No token covers a
// translucent chrome, so the stops are literal.
const CTA_CHROME =
  "linear-gradient(178.79deg, rgba(255,255,255,0.2) 2.36%, rgba(237,237,240,0.2) 38.57%, rgba(203,203,209,0.2) 62.39%, rgba(245,245,248,0.2) 97.64%)";
const CTA_SHADOW = "inset 0 0.667px 0 rgba(255,255,255,0.95), 0 1.335px 5.338px rgba(0,0,0,0.5)";

// Mona Sans bold, per the comp. Two of its six badge nodes are drawn in
// Quicksand instead; the card's other type is Mona Sans throughout, so the
// majority wins and the inconsistency is reported, not copied.
const BADGE_BASE =
  "text-grey-700 absolute top-4 left-4 rounded-full border border-white/20 bg-white px-3.5 font-serif font-bold";
const BADGE_BY_SURFACE: Record<ArkadeCardSurface, string> = {
  phone: "inline-flex h-[30px] items-center text-[13px]",
  desktop: "py-0.5 text-[12px]",
};

// Mona Sans semibold, so ws-display is out: it pins the weight at 700.
const CTA_BASE =
  "inline-flex shrink-0 items-center rounded-full border border-white px-4 font-serif leading-none font-semibold tracking-[-0.46px] text-white";
const CTA_BY_SURFACE: Record<ArkadeCardSurface, string> = {
  phone: "h-9 text-[12px]",
  desktop: "py-2.5 text-[11.5px]",
};

const NOTE_BASE =
  "block font-serif text-[14px] leading-[1.2] font-bold tracking-[-0.14px] text-white/65";
// The phone clamps a long one-liner to two lines. The desktop lets it run.
const NOTE_BY_SURFACE: Record<ArkadeCardSurface, string> = {
  phone: "line-clamp-2 ",
  desktop: "",
};

// The comp pins the copy 16px in from the left and the pill 16px in from the
// right. A flex row reproduces that and keeps the two apart as the copy grows,
// rather than letting a two-line note slide under the pill.
const COPY_ROW_BASE = "absolute inset-x-4 bottom-4 flex items-end justify-between";
const COPY_ROW_BY_SURFACE: Record<ArkadeCardSurface, string> = {
  phone: "gap-3",
  desktop: "gap-4",
};

// The artwork layer. `game.image` mixes local /public paths with absolute
// Unsplash and Wikimedia URLs, and the app configures no next/image
// remotePatterns, so a next/image here would reject the remote half outright.
// object-cover crops the frame without distorting a photograph, a logo or a
// character.
function CardArt({ game }: { game: CasinoGame }) {
  if (!game.image) {
    return (
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 grid place-items-center bg-[radial-gradient(ellipse_at_70%_20%,rgba(212,212,216,0.08),transparent_60%)]"
      >
        <span className="ws-display -rotate-8 text-[110px] leading-none text-white/10 select-none">
          {game.glyph}
        </span>
      </span>
    );
  }
  // preserveImageColor keeps branded art vivid while a game is still coming
  // soon. The phone used to ignore the flag and grey everything, so Pilot
  // Chicken lost its colour on a phone and kept it on a laptop.
  const dimmed = game.comingSoon && !game.preserveImageColor;
  return (
    <span aria-hidden className="pointer-events-none absolute inset-0">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={game.image}
        alt=""
        loading="lazy"
        className={`h-full w-full object-cover ${dimmed ? "opacity-50 grayscale" : ""}`}
      />
    </span>
  );
}

// Everything drawn inside the card frame, shared by the playable card and the
// coming soon one so the two cannot drift apart.
function CardBody({ game, surface }: { game: CasinoGame; surface: ArkadeCardSurface }) {
  const t = useTranslations("casino.hub");
  const badge = game.comingSoon
    ? t("badgeComingSoon")
    : game.isNew || game.category === "New"
      ? t("badgeNew")
      : null;

  return (
    <>
      <CardArt game={game} />
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ backgroundImage: `${SCRIM_DIAGONAL}, ${SCRIM_VERTICAL}` }}
      />

      {badge ? <span className={`${BADGE_BASE} ${BADGE_BY_SURFACE[surface]}`}>{badge}</span> : null}

      <span className={`${COPY_ROW_BASE} ${COPY_ROW_BY_SURFACE[surface]}`}>
        <span className="flex min-w-0 flex-col gap-2">
          <span className="ws-display block text-[18px] leading-none text-white">
            {t(`games.${game.id}.name`)}
          </span>
          {game.note ? (
            <span className={`${NOTE_BY_SURFACE[surface]}${NOTE_BASE}`}>
              {t(`games.${game.id}.note`)}
            </span>
          ) : null}
        </span>

        {game.comingSoon ? null : (
          <span
            className={`${CTA_BASE} ${CTA_BY_SURFACE[surface]}`}
            style={{ backgroundImage: CTA_CHROME, boxShadow: CTA_SHADOW }}
          >
            {t("playNow")}
          </span>
        )}
      </span>
    </>
  );
}

export interface ArkadeGameCardProps {
  // The catalogue entry this card draws.
  game: CasinoGame;
  // Which surface is drawing it. See the note on ArkadeCardSurface.
  surface: ArkadeCardSurface;
  // Called when a playable card is activated, with the game behind it. What
  // that does, navigating, reporting, or both, belongs to the caller.
  onActivate?: (game: CasinoGame) => void;
}

export function ArkadeGameCard({ game, surface, onActivate }: ArkadeGameCardProps) {
  const t = useTranslations("casino.hub");
  const name = t(`games.${game.id}.name`);

  // A game with no destination is not a control. Rendering it as a disabled
  // link or button would put an inert stop in the tab order, so it stays plain
  // content and the COMING SOON badge carries the reason.
  if (game.comingSoon || !game.href) {
    return (
      <div className={ARKADE_CARD_FRAME}>
        <CardBody game={game} surface={surface} />
      </div>
    );
  }

  // The card's own text is a name, a one-liner and an action, which reads as a
  // sentence fragment to a screen reader. The label states the action and the
  // game instead.
  const label = t("openGame", { name });

  if (surface === "phone") {
    return (
      <Link
        href={game.href}
        aria-label={label}
        onClick={() => onActivate?.(game)}
        className={`${ARKADE_CARD_FRAME} ws-pressable block`}
      >
        <CardBody game={game} surface={surface} />
      </Link>
    );
  }

  return (
    <button
      type="button"
      aria-label={label}
      onClick={() => onActivate?.(game)}
      className={`${ARKADE_CARD_FRAME} ws-pressable cursor-pointer text-left transition-[border-color] hover:border-white/30`}
    >
      <CardBody game={game} surface={surface} />
    </button>
  );
}
