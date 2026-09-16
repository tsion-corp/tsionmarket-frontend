"use client";

import { useTranslations } from "next-intl";
import type { LiveRound } from "@/lib/dashboard-feed";
import { DiscoveryCta } from "@/features/discovery/components/discovery-cta";
import {
  ConversationCard,
  Dust,
  KickerGlyph,
  across,
  artLayer,
  useHoldReport,
} from "@/features/discovery/components/conversation-card";

// The Arkade's own band: one card per game the Arkade can be played right
// now. Each is the shared frame in the game's colour, with the game's own
// motif where the room cards scatter faces, so the row reads as a shelf of
// games rather than a shelf of rooms. The Last Man card is the exception: the
// event has its own poster, and wears the band's height and radius alone.
//
// Every card here is pure. The row reads the feed and hands each card what it
// needs, so a card renders the same for a given input wherever it is drawn.

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

/** The gold-to-bark fill the Marathon wordmark is lettered in. */
const WORDMARK_INK = "bg-gradient-to-r from-[#ac6900] to-[#462b00] bg-clip-text text-transparent";

export interface LastManCardProps {
  /** The round worth joining, or null when none is open. */
  round: LiveRound | null;
  /** Milliseconds left in `round`, from the row's clock; null with no round. */
  remainingMs: number | null;
  onHold?: (held: boolean) => void;
}

// The Marathon poster. Where the other cards on this band wear the shared
// frame, this one is the event's own artwork: the wordmark lettered in gold
// over a hot yellow sky, the hourglass running behind it, and a single pill
// into the round. It keeps the band's height and radius so it stands flush
// beside its neighbours, and reports holds the way they do.
export function LastManCard({ round, remainingMs, onHold }: LastManCardProps) {
  const t = useTranslations("discovery");
  const hold = useHoldReport(onHold);

  // The poster draws neither the clock nor the pot the old card did, so the
  // round is read for one thing: where the pill goes. A round whose time has
  // already run out is not one to join, and the lobby takes it from there.
  const live = round !== null && remainingMs !== null && remainingMs > 0;

  return (
    <article
      className="relative h-[203px] overflow-hidden rounded-[18px] bg-[linear-gradient(126.36deg,#ffd52d_36.667%,#f5c500_87.735%)]"
      {...hold}
    >
      {/* The two cloud bands, in the order the design paints them. Each export
          is already the whole card rather than a strip, so it is laid over the
          frame instead of being positioned along the bottom. */}
      <div
        aria-hidden
        className={`${artLayer} inset-0 bg-[url('/market/lastman-clouds-back.png')] bg-[length:100%_100%] bg-no-repeat`}
      />
      <div
        aria-hidden
        className={`${artLayer} inset-0 bg-[url('/market/lastman-clouds-front.png')] bg-[length:100%_100%] bg-no-repeat`}
      />

      {/* The hourglass, and a blurred copy screened over it for the glow the
          design puts around the glass. Anchored to the right edge as a share of
          the card, so the wordmark keeps the left of it at every width. */}
      <div
        aria-hidden
        className={`${artLayer} top-1/2 right-[-4%] h-[210px] w-[210px] -translate-y-1/2 rotate-[13.21deg]`}
      >
        <img
          src="/market/lastman-hourglass.png"
          alt=""
          width={500}
          height={500}
          className="h-full w-full object-contain"
        />
        <img
          src="/market/lastman-hourglass.png"
          alt=""
          width={500}
          height={500}
          className="absolute inset-0 h-full w-full object-contain mix-blend-screen blur-[5.71px]"
        />
      </div>

      {/* The wordmark is one name broken over two lines, so it is one heading
          with two lines in it rather than two headings: a reader hears "Last
          Man Marathon" rather than a fragment and then another.
          A phone's card is narrower than the desk's, and the design's type ran
          the name into the hourglass there, so it steps down below md. */}
      <div className="relative z-[1] flex h-full flex-col items-start justify-center pl-[32px]">
        <h3>
          <span
            className={`block -rotate-[1.72deg] font-serif text-[21px] leading-[1.1] font-semibold tracking-[-2.2px] md:text-[34px] md:tracking-[-2.72px] ${WORDMARK_INK}`}
          >
            {t("lastManMarathonLead")}
          </span>{" "}
          <span
            className={`ws-chewy mt-[2px] block text-[32px] leading-[1.1] tracking-[-0.53px] md:text-[53px] ${WORDMARK_INK}`}
          >
            {t("lastManMarathonTitle")}
          </span>
        </h3>
        <DiscoveryCta
          href={live ? `/casino/last-standing/${round.gameId}` : "/casino/last-standing"}
          label={t("lastManJoinNow")}
          tone="dark"
          size={15}
          padding="px-[20.571px] py-[12.857px]"
          className="mt-[14px] border-[1.974px] border-[#ffd52d]"
          icon={
            <img
              src="/market/prediction-coins-white.svg"
              alt=""
              aria-hidden
              width={14}
              height={14}
              className="size-[13.818px] shrink-0"
            />
          }
        />
      </div>
    </article>
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
      action={{
        href: "/casino/checkers",
        label: live ? t("checkersJoin") : t("checkersPlay"),
        icon: <Chevron />,
      }}
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
      action={{ href: "/casino/arkball", label: t("arkballPlay"), icon: <Chevron /> }}
      onHold={onHold}
    />
  );
}

// Ink to royal blue. The motif is a board in the light, tilted the way it sits
// across a table, with the pieces as glyphs rather than art: the game reads at
// a glance and the card ships no export of its own.
const CHESS_PIECES = ["♜", "♞", "♝", "♛", "♚", "♟"];

export function ChessCard({ onHold }: { onHold?: (held: boolean) => void }) {
  const t = useTranslations("discovery");

  return (
    <ConversationCard
      gradient="bg-[linear-gradient(180deg,#050b18_0%,#2a4c9b_100%)]"
      art={
        <>
          <Dust />
          <div
            className={`${artLayer} top-[-22px] h-[136px] w-[136px] rounded-[6px] shadow-[0_18px_30px_rgba(0,0,0,0.45)]`}
            style={{
              right: across(52),
              backgroundImage: "repeating-conic-gradient(#e8e3d6 0 25%, #23324f 0 50%)",
              backgroundSize: "34px 34px",
              transform: "perspective(520px) rotateX(54deg) rotateZ(-14deg)",
              transformOrigin: "50% 100%",
            }}
          />
          <div
            className={`${artLayer} top-[16px] flex items-end gap-[6px]`}
            style={{ right: across(58), transform: "rotate(-6deg)" }}
          >
            {CHESS_PIECES.map((piece, index) => (
              <span
                key={piece}
                className="text-[26px] leading-none text-white drop-shadow-[0_4px_6px_rgba(0,0,0,0.55)]"
                style={{ opacity: index % 2 === 0 ? 1 : 0.7 }}
              >
                {piece}
              </span>
            ))}
          </div>
        </>
      }
      kicker={{ icon: <KickerGlyph glyph="♞" />, label: t("chessKicker") }}
      headline={t("chessHeadline")}
      action={{ href: "/casino/chess", label: t("chessPlay"), icon: <Chevron /> }}
      onHold={onHold}
    />
  );
}

// Ink to jet orange. The motif is the climb itself: the multiplier rising on a
// curve drawn in CSS, with the plane at its head and the game's own hero art
// fading in from the right.
export function ArkjetCard({ onHold }: { onHold?: (held: boolean) => void }) {
  const t = useTranslations("discovery");

  return (
    <ConversationCard
      gradient="bg-[linear-gradient(180deg,#1a0700_0%,#e0561a_100%)]"
      art={
        <>
          <img
            src="/casino/arkjet/hero.webp"
            alt=""
            aria-hidden
            width={482}
            height={203}
            className={`${artLayer} inset-y-0 right-0 h-full w-[58%] object-cover opacity-40`}
            style={{
              maskImage: "linear-gradient(90deg, transparent 0%, #000 55%)",
              WebkitMaskImage: "linear-gradient(90deg, transparent 0%, #000 55%)",
            }}
          />
          <Dust />
          {/* The climb: a quarter circle whose stroke is the curve, with the
              plane riding its head. Border radius rather than an SVG path, so
              the curve scales with the card and costs nothing. */}
          <span
            aria-hidden
            className={`${artLayer} top-[18px] h-[120px] w-[150px] rounded-tr-[150px] border-t-[3px] border-r-[3px] border-white/70`}
            style={{ right: across(56) }}
          />
          <span
            aria-hidden
            className={`${artLayer} top-[10px] text-[22px] leading-none`}
            style={{ right: across(44) }}
          >
            ✈
          </span>
          <span
            className={`${artLayer} top-[52px] rounded-full bg-black/35 px-[9px] py-[3px] font-serif text-[13px] leading-none font-bold text-white`}
            style={{ left: across(44.32) }}
          >
            {t("arkjetMultiplier")}
          </span>
        </>
      }
      kicker={{ icon: <KickerGlyph glyph="✈" />, label: t("arkjetKicker") }}
      headline={t("arkjetHeadline")}
      action={{ href: "/casino/arkjet", label: t("arkjetPlay"), icon: <Chevron /> }}
      onHold={onHold}
    />
  );
}

// Ink to lime. The motif is the crossing: lanes drawn in CSS with the chicken
// part way across, which is the whole game in one picture.
const LANES = [0, 1, 2, 3, 4];

export function PilotChickenCard({ onHold }: { onHold?: (held: boolean) => void }) {
  const t = useTranslations("discovery");

  return (
    <ConversationCard
      gradient="bg-[linear-gradient(180deg,#0a1403_0%,#79a819_100%)]"
      art={
        <>
          <Dust />
          <div
            className={`${artLayer} top-[-24px] flex h-[150px] items-stretch gap-[9px]`}
            style={{
              right: across(40),
              transform: "perspective(560px) rotateX(52deg) rotateZ(-8deg)",
            }}
          >
            {LANES.map((lane) => (
              <span
                key={lane}
                className="w-[26px] rounded-[4px] border border-white/25 bg-black/30 shadow-[0_10px_18px_rgba(0,0,0,0.35)]"
                style={{ opacity: 1 - lane * 0.15 }}
              />
            ))}
          </div>
          <img
            src="/casino/chicken/ark-chicken.png"
            alt=""
            aria-hidden
            width={482}
            height={203}
            className={`${artLayer} inset-y-0 right-0 h-full w-[52%] object-cover opacity-45`}
            style={{
              maskImage: "linear-gradient(90deg, transparent 0%, #000 60%)",
              WebkitMaskImage: "linear-gradient(90deg, transparent 0%, #000 60%)",
            }}
          />
        </>
      }
      kicker={{ icon: <KickerGlyph glyph="◆" />, label: t("chickenKicker") }}
      headline={t("chickenHeadline")}
      action={{ href: "/casino/chicken", label: t("chickenPlay"), icon: <Chevron /> }}
      onHold={onHold}
    />
  );
}
