"use client";

import { useTranslations } from "next-intl";
import { formatCountdown } from "@/hooks/use-countdown";
import type { LiveRound } from "@/lib/dashboard-feed";
import type { LiveConversation } from "@/features/discovery/hooks/use-live-conversations";
import {
  ConversationCard,
  Dust,
  FaceScatter,
  KickerGlyph,
  KickerIcon,
  across,
  artLayer,
} from "@/features/discovery/components/conversation-card";

// The four cards that sit beside the chess room on the "Join the Conversation"
// band. Each is the chess card's frame in its own hue with its own motif where
// the chess card scatters faces: an hourglass and a clock for the Last Man
// round, a board and discs for Checkers, a row of balls for ArkBall, and the
// hosts' faces for the rooms live on Market Square.
//
// Every card here is pure. The row reads the feeds and hands each card what it
// needs, so a card renders the same for a given input wherever it is drawn and
// the tests can put it in any state by passing a prop.

// The glyph after a pill's label, drawn inline so the cards need no icon
// exports of their own. Sized as the design draws the chess pills' glyphs.
function Chevron() {
  return (
    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0">
      <path
        d="m9 6 6 6-6 6"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ArrowOut() {
  return (
    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0">
      <path
        d="M7 17 17 7M9 7h8v8"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** "01:46:55" from the countdown's "00:01:46:55": the day field goes when it is zero. */
function clock(remainingMs: number): string {
  const full = formatCountdown(remainingMs) ?? "00:00:00:00";
  return full.startsWith("00:") ? full.slice(3) : full;
}

export interface LastManCardProps {
  /** The round worth joining, or null when none is open. */
  round: LiveRound | null;
  /** Milliseconds left in `round`, from the row's clock; null with no round. */
  remainingMs: number | null;
  onHold?: (held: boolean) => void;
}

// Ink to ember. The motif is the game's hourglass and, when a round is open,
// the clock on it: the time left inside a ring, the pot under the kicker.
export function LastManCard({ round, remainingMs, onHold }: LastManCardProps) {
  const t = useTranslations("discovery");
  const live = round !== null && remainingMs !== null && remainingMs > 0;

  return (
    <ConversationCard
      gradient="bg-[linear-gradient(180deg,#12030a_0%,#c2263a_100%)]"
      art={
        <>
          <Dust />
          <img
            src="/casino/last-man-hourglass.png"
            alt=""
            aria-hidden
            width={68}
            height={117}
            className={`${artLayer} top-[-6px] h-[117px] w-auto opacity-90 drop-shadow-[0_8px_12px_rgba(0,0,0,0.45)]`}
            style={{ left: across(46), transform: "rotate(-9deg)" }}
          />
          {/* The ring is the card's clock face. It only ticks while a round
              is open; idle it is a still ring with the hourglass, which is
              the game's own mark. */}
          <div
            className={`${artLayer} top-[10px] flex h-[84px] w-[84px] items-center justify-center`}
            style={{ right: across(52) }}
          >
            <svg
              viewBox="0 0 84 84"
              width="84"
              height="84"
              aria-hidden
              className="absolute inset-0"
            >
              <circle
                cx="42"
                cy="42"
                r="38"
                stroke="rgba(255,255,255,0.18)"
                strokeWidth="3"
                fill="none"
              />
              <circle
                cx="42"
                cy="42"
                r="38"
                stroke="#ffd166"
                strokeWidth="3"
                strokeLinecap="round"
                fill="none"
                strokeDasharray="239"
                strokeDashoffset={live ? 60 : 180}
                transform="rotate(-90 42 42)"
              />
            </svg>
            <span className="tnum relative font-serif text-[15px] leading-none font-bold text-white">
              {live ? clock(remainingMs) : "--:--"}
            </span>
          </div>
        </>
      }
      kicker={{
        icon: <KickerGlyph glyph="⌛" />,
        label: live ? t("lastManLiveKicker", { pot: round.pot }) : t("lastManKicker"),
      }}
      headline={live ? t("lastManLiveHeadline") : t("lastManIdleHeadline")}
      primary={{
        href: live ? `/casino/last-standing/${round.gameId}` : "/casino/last-standing",
        label: live ? t("lastManJoin") : t("lastManStart"),
        icon: <Chevron />,
      }}
      secondary={{ href: "/casino/last-standing", label: t("lastManHow"), icon: <Chevron /> }}
      onHold={onHold}
    />
  );
}

export interface CheckersCardProps {
  /** Matches being played right now. */
  liveCount: number;
  onHold?: (held: boolean) => void;
}

// Where the discs sit on the board, as a share of its width and height.
const DISCS: { x: number; y: number; dark: boolean }[] = [
  { x: 14, y: 14, dark: false },
  { x: 62, y: 14, dark: false },
  { x: 38, y: 38, dark: false },
  { x: 86, y: 38, dark: true },
  { x: 14, y: 62, dark: true },
  { x: 62, y: 62, dark: true },
  { x: 38, y: 86, dark: true },
];

// Ink to forest. The motif is a board drawn in CSS, tilted back the way a
// table reads from a chair, with discs on it.
export function CheckersCard({ liveCount, onHold }: CheckersCardProps) {
  const t = useTranslations("discovery");
  const live = liveCount > 0;

  return (
    <ConversationCard
      gradient="bg-[linear-gradient(180deg,#03120c_0%,#1f8a5b_100%)]"
      art={
        <>
          <Dust />
          <div
            className={`${artLayer} top-[-18px] h-[132px] w-[132px] rounded-[6px] shadow-[0_18px_30px_rgba(0,0,0,0.45)]`}
            style={{
              right: across(48),
              backgroundImage: "repeating-conic-gradient(#f2e7cf 0 25%, #2c1a10 0 50%)",
              backgroundSize: "33px 33px",
              transform: "perspective(520px) rotateX(52deg) rotateZ(-16deg)",
              transformOrigin: "50% 100%",
            }}
          >
            {DISCS.map((disc) => (
              <span
                key={`${disc.x}-${disc.y}`}
                className={`absolute size-[13px] -translate-x-1/2 -translate-y-1/2 rounded-full shadow-[0_2px_2px_rgba(0,0,0,0.5)] ${
                  disc.dark ? "bg-[#1c1c1e]" : "bg-[#d12727]"
                }`}
                style={{ left: `${disc.x}%`, top: `${disc.y}%` }}
              />
            ))}
          </div>
          {live ? (
            <span
              className={`${artLayer} top-[14px] rounded-full bg-white/15 px-[9px] py-[3px] font-serif text-[11px] leading-none font-semibold text-white`}
              style={{ left: across(44.32) }}
            >
              <span className="mr-[5px] inline-block size-[6px] rounded-full bg-[#5df2a4] align-middle" />
              {t("checkersLiveBadge", { count: liveCount })}
            </span>
          ) : null}
        </>
      }
      kicker={{ icon: <KickerGlyph glyph="◉" />, label: t("checkersKicker") }}
      headline={live ? t("checkersLiveHeadline", { count: liveCount }) : t("checkersIdleHeadline")}
      primary={{
        href: "/casino/checkers",
        label: live ? t("checkersJoin") : t("checkersPlay"),
        icon: <Chevron />,
      }}
      secondary={{ href: "/casino/checkers/learn", label: t("checkersLearn"), icon: <Chevron /> }}
      onHold={onHold}
    />
  );
}

// The five white balls and the one ArkBall, as the game draws a pick.
const BALLS = [7, 14, 23, 31, 45];

// Ink to amber. The motif is a drawn pick: five white balls and the ArkBall,
// over the game's own hero art fading in from the right.
export function ArkBallCard({ onHold }: { onHold?: (held: boolean) => void }) {
  const t = useTranslations("discovery");

  return (
    <ConversationCard
      gradient="bg-[linear-gradient(180deg,#1a0f00_0%,#d99a1e_100%)]"
      art={
        <>
          <img
            src="/casino/arkball/hero.png"
            alt=""
            aria-hidden
            width={482}
            height={203}
            className={`${artLayer} inset-y-0 right-0 h-full w-[62%] object-cover opacity-45`}
            style={{
              maskImage: "linear-gradient(90deg, transparent 0%, #000 55%)",
              WebkitMaskImage: "linear-gradient(90deg, transparent 0%, #000 55%)",
            }}
          />
          <Dust />
          <div
            className={`${artLayer} top-[22px] flex items-center gap-[7px]`}
            style={{ left: across(44.32), transform: "rotate(-6deg)", transformOrigin: "0 50%" }}
          >
            {BALLS.map((ball) => (
              <span
                key={ball}
                className="tnum grid size-[34px] place-items-center rounded-full bg-[radial-gradient(circle_at_35%_30%,#fff_0%,#d9d9d9_70%,#9a9a9a_100%)] font-serif text-[13px] font-bold text-[#1a0f00] shadow-[0_4px_6px_rgba(0,0,0,0.4)]"
              >
                {ball}
              </span>
            ))}
            <span className="tnum grid size-[40px] place-items-center rounded-full bg-[radial-gradient(circle_at_35%_30%,#ffd166_0%,#d99a1e_60%,#7a4e00_100%)] font-serif text-[14px] font-bold text-white shadow-[0_6px_8px_rgba(0,0,0,0.45)]">
              9
            </span>
          </div>
        </>
      }
      kicker={{ icon: <KickerGlyph glyph="●" />, label: t("arkballKicker") }}
      headline={t("arkballHeadline")}
      primary={{ href: "/casino/arkball", label: t("arkballPlay"), icon: <Chevron /> }}
      secondary={{ href: "/casino", label: t("arkballAll"), icon: <Chevron /> }}
      onHold={onHold}
    />
  );
}

export interface SquareCardProps {
  /** The room on show, or null when nothing is live. */
  room: LiveConversation | null;
  /** Hosts' faces across every live room, for the scatter. */
  avatars: readonly string[];
  /** The square's front door. */
  homeHref: string;
  onHold?: (held: boolean) => void;
}

// Ink to teal. The motif is the chess card's own: the faces of the people in
// the rooms, live on Market Square. Every link on it leaves for the square's
// deployment in a new tab.
export function SquareCard({ room, avatars, homeHref, onHold }: SquareCardProps) {
  const t = useTranslations("discovery");
  const live = room !== null && room.href !== null;

  return (
    <ConversationCard
      gradient="bg-[linear-gradient(180deg,#02121a_0%,#1d9aa8_100%)]"
      art={
        <>
          <Dust />
          <FaceScatter avatars={avatars} />
        </>
      }
      kicker={{
        icon:
          live && room.avatars[0] ? (
            <KickerIcon src={room.avatars[0]} />
          ) : (
            <KickerIcon src="/market/convo-house-icon.png" />
          ),
        label: live && room.host ? t("squareLiveKicker", { host: room.host }) : t("squareKicker"),
      }}
      headline={live ? room.title : t("squareIdleHeadline")}
      primary={
        live
          ? {
              href: room.href as string,
              label: t("squareJoin"),
              icon: <ArrowOut />,
              external: true,
            }
          : { href: homeHref, label: t("squareOpen"), icon: <ArrowOut />, external: true }
      }
      secondary={
        live
          ? { href: homeHref, label: t("squareOpen"), icon: <ArrowOut />, external: true }
          : { href: homeHref, label: t("squareStart"), icon: <ArrowOut />, external: true }
      }
      onHold={onHold}
    />
  );
}
