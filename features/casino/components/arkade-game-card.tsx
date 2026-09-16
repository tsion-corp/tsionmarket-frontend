"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import type { CasinoGame } from "@/features/casino/lib/games";
import type { GamePresence } from "@/features/casino/lib/api/types";

/**
 * One Arkade catalogue card.
 *
 * The desktop surface is transcribed from the redesign (Figma 2234:10833): a
 * 204px frame at the 20px corner with a 1.66px hairline and top light, the
 * game's cover art bled full and dimmed by a vertical wash plus a 153.72°
 * diagonal, a coloured badge pill top-left (Most Played / Hot / New), and a
 * bottom-left block of the name, a two-line one-liner, and — in a row — the live
 * player count beside a dark action pill (Play, or Challenge for a head-to-head
 * game). The phone surface (node 12:204) keeps its earlier card unchanged.
 *
 * Presentational. Activating a playable card calls `onActivate`; the player
 * count comes in through `presence` and is shown only when the presence API has
 * a real figure, never invented.
 */

export type ArkadeCardSurface = "phone" | "desktop";

// The badge states the redesign draws, each its own colour (2234:10837 / 10854
// / 10897). Which one a card wears is the section's call, passed as `badge`;
// left unset, the card falls back to its own New / Coming soon state.
export type ArkadeBadgeTone = "mostPlayed" | "hot" | "new" | "comingSoon";

const BADGE_TONE: Record<ArkadeBadgeTone, { className: string; key: string }> = {
  mostPlayed: { className: "bg-[#dc343c] text-white", key: "badgeMostPlayed" },
  hot: { className: "bg-[#db990c] text-white", key: "badgeHot" },
  new: { className: "bg-[#4382f9] text-white", key: "badgeNewSoft" },
  comingSoon: { className: "bg-white/90 text-[#0a0a0a]", key: "badgeComingSoon" },
};

// Chess is the head-to-head game: its action invites an opponent rather than
// dropping into a round, so it reads "Challenge" (and takes the comp's wider
// 95px pill) where the rest read "Play" in an 85.814px pill.
const CHALLENGE_GAMES = new Set(["chess"]);

// The desktop frame: the design's 1.66px hairline and inset top light over the
// 5% fill, at the 20px corner. (Phone keeps ws-card.)
export const ARKADE_CARD_FRAME = "ws-card rounded-card relative h-[204px] w-full overflow-hidden";
const DESKTOP_FRAME =
  "relative h-[204px] w-full overflow-hidden rounded-[20px] border-[1.66px] border-white/12 bg-white/5 shadow-[inset_0_1.66px_0_rgba(255,255,255,0.15)]";

// The comp's legibility treatment: a vertical wash sinks the bottom of the art
// to black, and a 153.72deg diagonal darkens the corner the copy sits in.
const SCRIM_VERTICAL = "linear-gradient(rgba(0,0,0,0.1), rgba(0,0,0,0.35) 45%, #000)";
const SCRIM_DIAGONAL = "linear-gradient(153.72deg, rgba(0,0,0,0.5) 0%, rgba(10,10,10,0) 60%)";

// Phone card: white badge + translucent chrome CTA (unchanged).
const PHONE_BADGE =
  "text-grey-700 absolute top-4 left-4 inline-flex h-[30px] items-center rounded-full border border-white/20 bg-white px-3.5 font-serif text-[13px] font-bold";
const CTA_CHROME =
  "linear-gradient(178.79deg, rgba(255,255,255,0.2) 2.36%, rgba(237,237,240,0.2) 38.57%, rgba(203,203,209,0.2) 62.39%, rgba(245,245,248,0.2) 97.64%)";
const CTA_SHADOW = "inset 0 0.667px 0 rgba(255,255,255,0.95), 0 1.335px 5.338px rgba(0,0,0,0.5)";

// A generic two-person glyph for the live-player line (the comp's user-multiple
// icon). Inline rather than an exported asset: the set carries no equivalent,
// and this keeps the card free of an expiring URL.
function UsersGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className={className}>
      <path
        d="M9 11.5a3.25 3.25 0 1 0 0-6.5 3.25 3.25 0 0 0 0 6.5ZM3.5 19c0-2.9 2.46-5 5.5-5s5.5 2.1 5.5 5M16 6.2a3 3 0 0 1 0 5.6M17 14.2c1.9.5 3.5 2 3.5 4.3"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// The artwork layer, bled to fill the frame. `game.image` mixes local paths
// with remote URLs and the app configures no next/image remotePatterns, so this
// stays a plain <img>; object-cover crops the frame without distorting the art.
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

// Which badge a desktop card wears: an explicit tone from the section wins;
// otherwise coming-soon, then the game's own New state, else none.
function badgeToneFor(game: CasinoGame, badge?: ArkadeBadgeTone): ArkadeBadgeTone | null {
  if (game.comingSoon) return "comingSoon";
  if (badge) return badge;
  if (game.isNew || game.category === "New") return "new";
  return null;
}

// The redesigned desktop card body (2234:10833).
function DesktopBody({
  game,
  presence,
  badge,
}: {
  game: CasinoGame;
  presence?: GamePresence;
  badge?: ArkadeBadgeTone;
}) {
  const t = useTranslations("casino.hub");
  const tone = badgeToneFor(game, badge);
  const players = presence && presence.playersOnline > 0 ? presence.playersOnline : null;
  const challenge = CHALLENGE_GAMES.has(game.id);

  return (
    <>
      <CardArt game={game} />
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ backgroundImage: `${SCRIM_DIAGONAL}, ${SCRIM_VERTICAL}` }}
      />

      {tone ? (
        <span
          className={`absolute top-[14.34px] left-[14.34px] inline-flex items-center rounded-[20.623px] px-[13.344px] py-[2.426px] font-serif text-[12px] leading-[22.746px] font-bold ${BADGE_TONE[tone].className}`}
        >
          {t(BADGE_TONE[tone].key)}
        </span>
      ) : null}

      <span className="absolute inset-x-[14px] bottom-[13.34px] flex flex-col gap-[12px]">
        {/* Title over a two-line note, held to a narrow column so the note
            wraps as it does in the comp. */}
        <span className="flex w-[190px] flex-col gap-[8.177px]">
          <span className="font-serif text-[18px] leading-[15.798px] font-bold whitespace-nowrap text-white">
            {t(`games.${game.id}.name`)}
          </span>
          {game.note ? (
            <span className="line-clamp-2 font-serif text-[13px] leading-[1.3] font-bold tracking-[-0.13px] text-white/65">
              {t(`games.${game.id}.note`)}
            </span>
          ) : null}
        </span>

        <span className="flex min-h-[38px] items-center justify-between gap-3">
          {players != null ? (
            <span className="flex items-center gap-[6.977px]">
              <UsersGlyph className="size-6 shrink-0 text-white/60" />
              <span className="font-serif text-[12px] leading-[1.1] font-semibold tracking-[-0.18px] whitespace-nowrap text-white/60">
                {t("presencePlaying", { count: players.toLocaleString() })}
              </span>
            </span>
          ) : (
            <span aria-hidden />
          )}

          {game.comingSoon ? null : (
            <span
              className={`inline-flex shrink-0 items-center justify-center rounded-full bg-[#2d2f31] px-[9.846px] py-[12px] font-serif text-[13px] leading-[1.1] font-semibold tracking-[-0.26px] text-white ${
                challenge ? "w-[95px]" : "w-[85.814px]"
              }`}
            >
              {challenge ? t("challenge") : t("play")}
            </span>
          )}
        </span>
      </span>
    </>
  );
}

// The phone card body (unchanged): white badge, chrome CTA, copy 16px in.
function PhoneBody({ game }: { game: CasinoGame }) {
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

      {badge ? <span className={PHONE_BADGE}>{badge}</span> : null}

      <span className="absolute inset-x-4 bottom-4 flex items-end justify-between gap-3">
        <span className="flex min-w-0 flex-col gap-2">
          <span className="ws-display block text-[18px] leading-none text-white">
            {t(`games.${game.id}.name`)}
          </span>
          {game.note ? (
            <span className="line-clamp-2 block font-serif text-[14px] leading-[1.2] font-bold tracking-[-0.14px] text-white/65">
              {t(`games.${game.id}.note`)}
            </span>
          ) : null}
        </span>

        {game.comingSoon ? null : (
          <span
            className="inline-flex h-9 shrink-0 items-center rounded-full border border-white px-4 font-serif text-[12px] leading-none font-semibold tracking-[-0.46px] text-white"
            style={{ backgroundImage: CTA_CHROME, boxShadow: CTA_SHADOW }}
          >
            {t("playNow")}
          </span>
        )}
      </span>
    </>
  );
}

function CardBody({
  game,
  surface,
  presence,
  badge,
}: {
  game: CasinoGame;
  surface: ArkadeCardSurface;
  presence?: GamePresence;
  badge?: ArkadeBadgeTone;
}) {
  return surface === "desktop" ? (
    <DesktopBody game={game} presence={presence} badge={badge} />
  ) : (
    <PhoneBody game={game} />
  );
}

export interface ArkadeGameCardProps {
  game: CasinoGame;
  surface: ArkadeCardSurface;
  // Live figures for this game, absent until the presence API answers. Drives
  // the desktop card's player line; never invented when missing.
  presence?: GamePresence;
  // The badge the section wants this card to wear (desktop only).
  badge?: ArkadeBadgeTone;
  // How a playable desktop-surface card renders: a button (the desktop route
  // pushes on activate) or a real anchor (the phone rails, so long-press and
  // open-in-new-tab work). Ignored by the phone surface, which is always a Link.
  render?: "button" | "link";
  onActivate?: (game: CasinoGame) => void;
}

export function ArkadeGameCard({
  game,
  surface,
  presence,
  badge,
  render = "button",
  onActivate,
}: ArkadeGameCardProps) {
  const t = useTranslations("casino.hub");
  const name = t(`games.${game.id}.name`);
  const frame = surface === "desktop" ? DESKTOP_FRAME : ARKADE_CARD_FRAME;

  // A game with no destination is not a control; it stays plain content and the
  // COMING SOON badge carries the reason.
  if (game.comingSoon || !game.href) {
    return (
      <div className={frame}>
        <CardBody game={game} surface={surface} presence={presence} badge={badge} />
      </div>
    );
  }

  const label = t("openGame", { name });

  if (surface === "phone") {
    return (
      <Link
        href={game.href}
        aria-label={label}
        onClick={() => onActivate?.(game)}
        className={`${frame} ws-pressable block`}
      >
        <CardBody game={game} surface={surface} presence={presence} badge={badge} />
      </Link>
    );
  }

  // Phone rails want a real anchor over the desktop visual so a long-press and
  // open-in-new-tab work; the desktop route drives its own navigation, so there
  // it stays a button.
  if (render === "link") {
    return (
      <Link
        href={game.href}
        aria-label={label}
        onClick={() => onActivate?.(game)}
        className={`${frame} ws-pressable block cursor-pointer text-left transition-[border-color] hover:border-white/30`}
      >
        <CardBody game={game} surface={surface} presence={presence} badge={badge} />
      </Link>
    );
  }

  return (
    <button
      type="button"
      aria-label={label}
      onClick={() => onActivate?.(game)}
      className={`${frame} ws-pressable cursor-pointer text-left transition-[border-color] hover:border-white/30`}
    >
      <CardBody game={game} surface={surface} presence={presence} badge={badge} />
    </button>
  );
}
