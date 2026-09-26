"use client";

import { useSyncExternalStore, type JSX, type ReactNode, type Ref } from "react";
import { motion } from "motion/react";
import { PlayerAvatar } from "@/features/casino/components/last-standing/player-avatar";
import { cn } from "@/lib/utils";

/**
 * The big left "stage" card on the Last Man Standing game screen.
 *
 * Presentational only: every string, figure and image arrives as a prop, so
 * the card renders the same in a story, a test and the live screen. It holds
 * no clock — the caller formats `countdown` and recomputes `progress`, and the
 * card only draws them. The Figma rebrand draws four states out of one frame
 * (node 844:78328 and its siblings), which is why the phases share a single
 * component rather than four near-copies.
 */
export type StagePhase = "notStarted" | "live" | "ended" | "won";

export interface StageLeader {
  label: string;
  value: string;
  isYou: boolean;
  avatarUrl: string | null;
  seed: string;
}

export interface StageChip {
  label: string;
  /**
   * Which badge this is. The design draws three:
   * - `"leading"`: the viewer leads the countdown — the #FFD02C gold pill with
   *   a near-black rim and the filled crown (847:80392).
   * - `"winner"`: the viewer won — the same pill in #F7A92F (844:78881).
   * - `"other"`: another player leads (916:84111) or won (918:86248) — a dark
   *   #333 pill with a 1px white rim, a #F4F4F4 label and the outline crown.
   * Size, padding, radius and type are shared by all three.
   */
  tone: "leading" | "winner" | "other";
}

export interface StageTile {
  label: string;
  value: string;
}

export interface StageCardProps {
  phase: StagePhase;
  /**
   * Already formatted, e.g. "Rounds #3" — the round this game is on, counting
   * its stakes, not the game's id. Null while the feed that counts them has
   * not answered: the slot keeps its height so the card does not jump, but no
   * number is shown, because an invented one reads as fact.
   */
  roundLabel: string | null;
  /**
   * The control in the card's top-right corner, mirroring the round label
   * opposite it. A node rather than a flag: the card draws, and the sound
   * switch it holds today owns state the card has no business knowing.
   */
  cornerAction?: ReactNode;
  /** live only — already formatted, e.g. "00:24". */
  countdown?: string;
  /** live only — 0..1 remaining, drives the ring. */
  progress?: number;
  /**
   * live only — whole seconds left on the round, the same number `countdown`
   * was formatted from. Drives the urgent colour: at `URGENT_SECONDS` or
   * fewer (and still above zero) the ring's arc turns red. Omitted, the arc
   * stays gold.
   */
  secondsLeft?: number;
  /** The line under the centre column. */
  caption: string;
  /** ended / won heading. */
  heading?: string;
  /** ended / won sub line. */
  subheading?: string;
  leader: StageLeader | null;
  chip?: StageChip | null;
  /** e.g. { label: "Total Pot", value: "$20" }. */
  pot?: StageTile | null;
  /** The gold tile, e.g. { label: "Winner's Share", value: "$10" }. */
  winnerShare?: StageTile | null;
  /** A handle on the pot tile, for a caller that animates something into it.
   *  The wager's coin flight needs the pot's viewport box, and the pot is drawn
   *  here rather than by the caller, so the box is only reachable this way. */
  potRef?: Ref<HTMLDivElement>;
  /** Connection lost: dim the clock and its ring, and add nothing else — the
   *  caller owns the banner that explains why. */
  frozen?: boolean;
  /** Overlay slot, drawn over the stage for the states the caller still owns. */
  children?: ReactNode;
}

const ASSET_ROOT = "/casino/last-standing";

// Exported from Figma rather than drawn here: these are rendered 3D glyphs, not
// icons that could be reproduced from path data.
const GLYPH: Record<StagePhase, { src: string; size: number }> = {
  notStarted: { src: `${ASSET_ROOT}/glyph-play.png`, size: 56 },
  live: { src: `${ASSET_ROOT}/glyph-hourglass.png`, size: 56 },
  ended: { src: `${ASSET_ROOT}/glyph-flag.png`, size: 132 },
  won: { src: `${ASSET_ROOT}/glyph-crown.png`, size: 118 },
};

// The ring's geometry, straight off the design's Ellipse 1826/1827 pair: a
// 222.268px box with an 11.1134px stroke, so the stroked circle's radius is
// half the box less half the stroke.
const RING_BOX = 222.268;
const RING_STROKE = 11.1134;
const RING_RADIUS = (RING_BOX - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
const RING_TRACK = "#2A2B2B";
const RING_ARC = "#D4B32D";
// The design draws no urgent variant of the timer — every copy of the arc
// (Ellipse 1827 on 844:78897, 916:83412 and their siblings) is the same
// #D4B32D. The red is the design's only other one on this screen: the
// "Another player is leading" badge (`916:84150`, #FF745B), so the page
// carries a single red rather than a second, invented one.
const RING_ARC_URGENT = "#FF745B";

/**
 * The round is urgent at this many seconds left or fewer. Whole seconds, and
 * `<=`, so 10 is red and 11 is gold — there is no rounding in between that
 * could flip the colour back and forth at the boundary.
 */
export const URGENT_SECONDS = 10;

/** True only while a live round has run down to its last `URGENT_SECONDS`. */
export function isUrgent(secondsLeft: number | undefined): boolean {
  if (secondsLeft == null || !Number.isFinite(secondsLeft)) return false;
  return secondsLeft > 0 && secondsLeft <= URGENT_SECONDS;
}

// The placeholder the design shows before a round starts, in place of a clock,
// transcribed from the not-started stage frame (`929:1766`) rather than
// invented: hyphens with spaces around the colon, not em dashes.
const CLOCK_PLACEHOLDER = "-- : --";

const CLOCK_GRADIENT = "linear-gradient(180deg, #ffffff 0%, #c4c4c4 100%)";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeToReducedMotion(onChange: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
  const list = window.matchMedia(REDUCED_MOTION_QUERY);
  list.addEventListener("change", onChange);
  return () => list.removeEventListener("change", onChange);
}

function reducedMotionSnapshot(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

/**
 * Read live rather than through motion's own useReducedMotion, which settles
 * the preference once per process. That is right in a browser, where the
 * setting rarely flips, but it pins the value across a whole test file and
 * made the static-arc case unassertable.
 */
function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribeToReducedMotion, reducedMotionSnapshot, () => false);
}

function clampProgress(progress: number | undefined): number {
  if (progress == null || Number.isNaN(progress)) return 1;
  return Math.min(1, Math.max(0, progress));
}

function LeaderAvatar({ leader }: { leader: StageLeader }) {
  return (
    <span data-testid="stage-avatar" className="block shrink-0">
      {/* Decoration beside the address it belongs to, which is already read
          out, so it carries no alt of its own. */}
      <PlayerAvatar src={leader.avatarUrl} seed={leader.seed} size={36} alt="" />
    </span>
  );
}

const CHIP_TONE: Record<StageChip["tone"], { className: string; crown: string }> = {
  leading: {
    className: "border-[#1b1b1c] bg-[#ffd02c] text-[#1b1b1c]",
    crown: `${ASSET_ROOT}/chip-crown-filled.svg`,
  },
  winner: {
    className: "border-[#1b1b1c] bg-[#f7a92f] text-[#1b1b1c]",
    crown: `${ASSET_ROOT}/chip-crown-filled.svg`,
  },
  // 916:84111: #333 fill, 1px #FFFFFF rim, #F4F4F4 label, and the outline
  // crown exported from that node (white stroke, no fill).
  other: {
    className: "border-white bg-[#333] text-[#f4f4f4]",
    crown: `${ASSET_ROOT}/stage-chip-crown-outline.svg`,
  },
};

function LeaderChip({ chip }: { chip: StageChip }) {
  const tone = CHIP_TONE[chip.tone];
  return (
    <span
      data-testid="stage-chip"
      data-tone={chip.tone}
      className={cn(
        // B4 / T11: a pill with a 1px rim and a Quicksand Bold 11.455/13.091
        // label, 19.636/8.182 padding, 40.909 radius, 6.545 gap. The tones
        // differ only in fill, rim, ink and which crown they carry.
        "ws-quick inline-flex shrink-0 items-center gap-[6.545px] rounded-[40.909px] border px-[19.636px] py-[8.182px] text-[11.455px] leading-[13.091px]",
        tone.className
      )}
    >
      {/* The crown is drawn in a 17x17 box inset 8.33% vertically and 12.5%
          horizontally — the padding here is that inset, so the 13.8122x15.2292
          glyph lands at 12.75x14.17 inside the box the design reserves for
          it. Both exports share that geometry. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={tone.crown}
        alt=""
        aria-hidden="true"
        width={17}
        height={17}
        className="block size-[17px] shrink-0 px-[2.125px] py-[1.417px]"
      />
      {chip.label}
    </span>
  );
}

/**
 * The pot's icon is three money bags, not one picture of three (`916:84639`),
 * and each bag is its own export: they are not copies of one drawing. In a
 * 21.25x20 box of three 14.375px frames, painted in the design's own layer
 * order — front-left, then the back bag, then front-right on top:
 * - front-left (`916:84640`) at 0,5.625, its artwork cropped inside the frame
 *   at inset 4.73% / 10.79% / 4.7% / 10.78%;
 * - back (`916:84669`) at 3.125,0, filling its frame;
 * - front-right (`916:84696`) at 6.875,5.625, whose export carries its own
 *   drop shadow (dy 3.48, blur 1.74, 25% black) and so bleeds past the frame
 *   by -20.58% / -13.41% / -43.69% / -23.58%.
 */
const POT_BAGS: ReadonlyArray<{
  src: string;
  left: number;
  top: number;
  /** Where the artwork sits inside its 14.375px frame, as CSS inset. */
  inset: string;
}> = [
  {
    src: `${ASSET_ROOT}/stage-pot-bag-front-left.svg`,
    left: 0,
    top: 5.625,
    inset: "4.73% 10.79% 4.7% 10.78%",
  },
  { src: `${ASSET_ROOT}/stage-pot-bag-back.svg`, left: 3.125, top: 0, inset: "0" },
  {
    src: `${ASSET_ROOT}/stage-pot-bag-front-right.svg`,
    left: 6.875,
    top: 5.625,
    inset: "-20.58% -13.41% -43.69% -23.58%",
  },
];

function MoneyBags({ gold }: { gold: boolean }) {
  // The winner's share carries a single 20px bag (`916:84364`); same artwork,
  // one copy.
  if (gold) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`${ASSET_ROOT}/tile-share.svg`}
        alt=""
        aria-hidden="true"
        width={20}
        height={20}
        className="block size-5 shrink-0"
      />
    );
  }

  return (
    <span className="relative block h-5 w-[21.25px] shrink-0">
      {POT_BAGS.map((bag) => (
        <span
          key={bag.src}
          data-testid="stage-pot-bag"
          style={{ left: bag.left, top: bag.top }}
          className="absolute block size-[14.375px]"
        >
          <span style={{ inset: bag.inset }} className="absolute block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={bag.src}
              alt=""
              aria-hidden="true"
              width={14.375}
              height={14.375}
              className="absolute inset-0 block size-full max-w-none"
            />
          </span>
        </span>
      ))}
    </span>
  );
}

function StatTile({
  tile,
  tone,
  testId,
  tileRef,
}: {
  tile: StageTile;
  tone: "dark" | "gold";
  testId: string;
  tileRef?: Ref<HTMLDivElement>;
}) {
  const gold = tone === "gold";

  return (
    <div
      ref={tileRef}
      data-testid={testId}
      // Deliberately larger than the design draws it: the maintainer asked for
      // 184px-wide tiles with 18px padding and a 40px value, against the
      // design's 152x96 at 15px padding and a 36px value. Keep it.
      //
      // The rim: a plain 1px solid #FFFFFF stroke on both tiles (916:84637,
      // 916:84725) — the tiles differ only in the alpha of their gradient and
      // in the colour of their value.
      className={cn(
        "flex min-w-0 flex-col gap-2 rounded-[15px] border border-white p-[18px]",
        gold
          ? "bg-[linear-gradient(180deg,rgba(255,243,199,0.5)_0%,rgba(255,225,120,0.5)_100%)]"
          : "bg-[linear-gradient(180deg,rgba(255,243,199,0.24)_0%,rgba(255,225,120,0.24)_100%)]"
      )}
    >
      <span className="flex items-center gap-1">
        <MoneyBags gold={gold} />
        {/* T30/T31: Mona Sans Bold 11/1.4, white. "Total Pot" carries -0.11px
            of tracking and "Winner's Share" carries none — the design's own
            inconsistency, kept rather than averaged. */}
        <span
          className={cn(
            "ws-display truncate text-[11px] leading-[1.4] font-bold text-white",
            gold ? "tracking-normal" : "tracking-[-0.11px]"
          )}
        >
          {tile.label}
        </span>
      </span>
      {/* T32/T33: Bold 700, gold on the pot and white on the winner's share. */}
      <span
        className={cn(
          "ws-display tnum truncate text-[28px] leading-none font-bold tracking-[-1.08px] @[560px]:text-[40px]",
          gold ? "text-white" : "text-[#ffe178]"
        )}
      >
        {tile.value}
      </span>
    </div>
  );
}

function CountdownRing({
  progress,
  urgent,
  animated,
}: {
  /** Already clamped to 0..1. */
  progress: number;
  urgent: boolean;
  animated: boolean;
}) {
  // The arc is drawn by hiding part of a full circle: a dash as long as the
  // circumference, pushed back by the share of time already spent.
  const offset = RING_CIRCUMFERENCE * (1 - progress);
  const stroke = urgent ? RING_ARC_URGENT : RING_ARC;
  const shared = {
    cx: RING_BOX / 2,
    cy: RING_BOX / 2,
    r: RING_RADIUS,
    fill: "none",
    stroke,
    strokeWidth: RING_STROKE,
    strokeLinecap: "round" as const,
    strokeDasharray: RING_CIRCUMFERENCE,
    "data-testid": "stage-ring-arc",
    "data-circumference": RING_CIRCUMFERENCE,
    "data-offset": offset,
    "data-animated": String(animated),
    "data-urgent": String(urgent),
    "data-stroke": stroke,
  };

  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox={`0 0 ${RING_BOX} ${RING_BOX}`}
      className="absolute inset-0 size-full -rotate-90"
    >
      <circle
        data-testid="stage-ring-track"
        cx={RING_BOX / 2}
        cy={RING_BOX / 2}
        r={RING_RADIUS}
        fill="none"
        stroke={RING_TRACK}
        strokeWidth={RING_STROKE}
      />
      {animated ? (
        <motion.circle
          {...shared}
          initial={false}
          animate={{ strokeDashoffset: offset, stroke }}
          // The colour eases over rather than snapping, once, at the
          // threshold; it has nothing to animate on any other tick.
          transition={{
            strokeDashoffset: { duration: 0.4, ease: "easeOut" },
            stroke: { duration: 0.3, ease: "easeInOut" },
          }}
        />
      ) : (
        // Reduced motion keeps the arc — it is information, not decoration —
        // and drops only the sweep between one value and the next. The
        // urgent colour still applies; it just swaps instead of fading.
        <circle {...shared} strokeDashoffset={offset} />
      )}
    </svg>
  );
}

export function StageCard({
  phase,
  roundLabel,
  cornerAction,
  countdown,
  progress,
  secondsLeft,
  caption,
  heading,
  subheading,
  leader,
  chip,
  pot,
  winnerShare,
  potRef,
  frozen = false,
  children,
}: StageCardProps): JSX.Element {
  const prefersReducedMotion = usePrefersReducedMotion();
  const glyph = GLYPH[phase];
  // The clock and its ring belong to the two phases where a round has not been
  // decided yet; ended and won show a glyph and a heading instead.
  const showsClock = phase === "notStarted" || phase === "live";
  // The Winning (844:78328) and Round Ended (918:85695) stages draw no Total
  // Pot / Winner's Share tiles, so the card drops them there whatever the
  // caller passes.
  const showsTiles = phase === "notStarted" || phase === "live";
  const tiles = showsTiles && (pot ?? winnerShare) ? { pot, winnerShare } : null;

  return (
    <section
      data-testid="stage-card"
      data-phase={phase}
      className="@container relative isolate flex min-h-[372px] w-full flex-col overflow-hidden rounded-[15px] bg-[#121314] p-3"
    >
      {/* The spotlight artwork, exported whole from the design rather than
          rebuilt out of its forty vector layers — but exported at the size the
          design draws it, which is much wider than the card: the backdrop
          group (`847:79840`, `929:1203`) is 1896.264 x 472.48, sat at top
          3.52px and centred on a 696-wide card, so it runs off both edges and
          below the bottom and the card's own clip crops it. Squeezing that
          4.01:1 group into the card's 1.87:1 frame is what put the rays and
          the speckles at the wrong scale. The width is a percentage of the
          card so the crop stays the design's crop at any card width; the top
          radius belongs to the group and only shows if the card is ever wider
          than the group. The 0.5 is the group's own opacity, so the export
          must not bake it in. The min-height is the one concession: on a card
          much narrower than the design's the group would end above the card's
          floor and leave a seam, so it stretches to the floor and the cover
          crops the sides instead. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-[3.52px] left-1/2 min-h-full w-[272.452%] -translate-x-1/2 rounded-t-[95.13px] bg-[url('/casino/last-standing/stage-backdrop.svg')] bg-cover bg-top bg-no-repeat opacity-50"
        style={{ aspectRatio: "1896.264 / 472.48" }}
      />
      {/* V5, `847:80395`: one 184.228 x 108.319 ellipse of #F5EDD3 at half
          opacity under a Gaussian blur of stdDeviation 81.0264 — CSS's blur()
          takes the same standard deviation, so the radius is the design's
          number rather than a guess. Centred on the card (`929:1758` sits at
          256,132, which is dead centre of 696 x 372). */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-1/2 h-[108.319px] w-[184.228px] max-w-full -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#f5edd3] opacity-50 blur-[81px]"
      />

      {/* The slot holds its line box even with nothing in it, so the ring and
          everything under it sit at the same height whether or not the round
          is known yet. */}
      {/* T1: Quicksand Bold 14/16, #F4F4F4. */}
      <p className="ws-quick relative px-[17px] pt-[10px] text-[14px] leading-4 text-[#f4f4f4]">
        {roundLabel ?? " "}
      </p>

      {/* Mirrors the round label across the card: that line sits at left 29 /
          top 22 (the card's 12px padding plus its own 17/10), so this takes the
          same top and the same inset from the right.
          Absolute rather than sharing the label's line box, because the control
          is 34px tall against the label's 16px line — in flow it would grow
          that row and push the ring and everything under it down. */}
      {cornerAction ? (
        <div className="absolute top-[22px] right-[29px] z-10 flex items-center gap-2">
          {cornerAction}
        </div>
      ) : null}

      {/* Tight vertical padding on purpose: the design's card is 372px tall
          with the ring, the caption and the strip already filling it, so any
          generous padding here pushes the card past its drawn height. */}
      {/* The clock phases centre; the ended and won phases sit HIGH, and that
          is drawn, not a preference. On the Winner stage (918:87239) the hero
          group `918:88455` is at y=33 in the 372px card and is 252 tall, so it
          ends at 285 — 33 above it, 87 below. Centring it would put 60 either
          side and pull the sub-line down towards the leader strip, which is
          what made the block read as cramped.
          The strip `918:88445` starts at y=301, so the drawn gap below the
          text is 16px and the rest of the slack is free space. Aligning to the
          top with the card's own 12px padding subtracted (33 - 12 = 21) puts
          the group where the design puts it and lets the slack fall below it. */}
      <div
        className={cn(
          "relative flex flex-1 flex-col items-center gap-4 px-2",
          showsClock ? "justify-center py-1" : "justify-start pt-[21px] pb-1"
        )}
      >
        {showsClock ? (
          <div
            data-testid="stage-clock"
            data-frozen={String(frozen)}
            className={cn(
              "relative aspect-square w-[196px] max-w-full transition-opacity @[560px]:w-[222px]",
              frozen && "opacity-40"
            )}
          >
            {/* Not-started shows the bare track: there is no time to run down
                yet, so an arc would be a lie. */}
            {phase === "live" ? (
              <CountdownRing
                progress={clampProgress(progress)}
                urgent={isUrgent(secondsLeft)}
                animated={!prefersReducedMotion}
              />
            ) : (
              <svg
                aria-hidden="true"
                focusable="false"
                viewBox={`0 0 ${RING_BOX} ${RING_BOX}`}
                className="absolute inset-0 size-full"
              >
                <circle
                  data-testid="stage-ring-track"
                  cx={RING_BOX / 2}
                  cy={RING_BOX / 2}
                  r={RING_RADIUS}
                  fill="none"
                  stroke={RING_TRACK}
                  strokeWidth={RING_STROKE}
                />
              </svg>
            )}

            <div className="absolute inset-0 flex flex-col items-center justify-center gap-[9px]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                data-testid="stage-glyph"
                src={glyph.src}
                alt=""
                aria-hidden="true"
                width={glyph.size}
                height={glyph.size}
                className="block size-[56px] shrink-0"
              />
              {/* aria-live is off on purpose: a clock that announced every
                  second would talk over everything else on the screen. The
                  caller announces the milestones it cares about. */}
              <p
                data-testid="stage-countdown"
                aria-live="off"
                className="ws-display tnum bg-clip-text text-center text-[40px] leading-none font-extrabold tracking-[-1.45px] text-transparent @[560px]:text-[48px]"
                style={{ backgroundImage: CLOCK_GRADIENT }}
              >
                {phase === "live" ? (countdown ?? CLOCK_PLACEHOLDER) : CLOCK_PLACEHOLDER}
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              data-testid="stage-glyph"
              src={glyph.src}
              alt=""
              aria-hidden="true"
              width={glyph.size}
              height={glyph.size}
              // Each state has its own drawn box: the crown is 118 (`844:78885`)
              // and the round-ended object is 132 (`918:86253`). They are not
              // interchangeable, and neither carries a background of its own —
              // the PNG is all there is.
              className={cn(
                "block size-[104px] shrink-0",
                phase === "won" ? "@[560px]:size-[118px]" : "@[560px]:size-[132px]"
              )}
            />
            {/* 844:78886 / 918:86254: the heading and its sub line are one
                group, 12px apart, sat 16px under the glyph (the column's
                gap-4). */}
            {heading || subheading ? (
              <div
                data-testid="stage-headline"
                className="flex max-w-[388px] flex-col items-center gap-3 text-center"
              >
                {heading ? (
                  <h2 className="ws-display text-center text-[28px] leading-none font-extrabold tracking-[-1.08px] text-white capitalize @[560px]:text-[36px]">
                    {heading}
                  </h2>
                ) : null}
                {/* T7/T8: Quicksand Bold 14, 70% white, centred. Winning
                    (844:78888) sets it 1.2 in a 268px box; Round Ended
                    (918:86256) sets it 1.3 across the group's width. */}
                {subheading ? (
                  <p
                    data-testid="stage-subheading"
                    className={cn(
                      "ws-quick text-center text-[14px] text-[#f4f4f4]/70",
                      phase === "won" ? "w-[268px] max-w-full leading-[1.2]" : "leading-[1.3]"
                    )}
                  >
                    {subheading}
                  </p>
                ) : null}
              </div>
            ) : null}
          </>
        )}

        {/* T4: Mona Sans SemiBold 13/1.4, white at 80% (844:79686). */}
        {caption ? (
          <p
            data-testid="stage-caption"
            className="max-w-[300px] text-center font-serif text-[13px] leading-[1.4] font-semibold tracking-[-0.13px] text-white/80"
          >
            {caption}
          </p>
        ) : null}
      </div>

      {/* A sibling of the centre column rather than a child of it, so the
          absolute placement anchors on the card itself — the design puts the
          tiles 25px in from its top-right corner. On a narrow card the
          absolute positioning drops away and DOM order takes over, landing
          them between the centre column and the leader strip.

          The breakpoint is 672 and not 560 because of what the floating layout
          costs in width. The clock is centred on the card, so its right edge is
          at W/2 + 111; the tiles are 184 wide and sit 25 from the right, so
          their left edge is at W - 209. Those cross when W/2 + 111 > W - 209,
          that is below W = 640 — the tiles land on top of the countdown. 672
          clears it by 16px, and the design's own 696 clears it by 28.

          This only became visible when the tiles grew. At the design's 152px
          width the collision started at 576, a 16px-wide band nobody would
          meet; at the 184px the maintainer asked for, the band runs 560 to 640
          and is impossible to miss while resizing.

          Note the typography on this card still steps up at 560 and should:
          one breakpoint was doing two unrelated jobs, and only the tiles' half
          of it was wrong. */}
      {tiles ? (
        <div
          data-testid="stage-tiles"
          className={cn(
            "relative mx-auto mt-2 mb-4 grid w-full max-w-[380px] grid-cols-2 gap-2 @[672px]:absolute @[672px]:right-[25px] @[672px]:m-0 @[672px]:w-[184px] @[672px]:max-w-none @[672px]:grid-cols-1",
            // The design puts the tiles at top 25, which is where the corner
            // control now sits. With one present they start below it instead:
            // 22 + its 34px box + a 14px gap.
            cornerAction ? "@[672px]:top-[70px]" : "@[672px]:top-[25px]"
          )}
        >
          {pot ? <StatTile tile={pot} tone="dark" testId="stage-pot" tileRef={potRef} /> : null}
          {winnerShare ? (
            <StatTile tile={winnerShare} tone="gold" testId="stage-winner-share" />
          ) : null}
        </div>
      ) : null}

      {leader ? (
        <div
          data-testid="stage-leader"
          data-you={String(leader.isYou)}
          className="relative flex flex-col items-start gap-3 rounded-[15px] bg-[#1d1d1d] p-3 @[560px]:flex-row @[560px]:items-center @[560px]:justify-between"
        >
          <span className="flex max-w-full min-w-0 items-center gap-[9px]">
            <LeaderAvatar leader={leader} />
            <span className="flex min-w-0 flex-col gap-[6.75px]">
              {/* T9: Quicksand Bold 11/12, 40% white. */}
              <span className="ws-quick truncate text-[11px] leading-3 text-[#f4f4f4]/40">
                {leader.label}
              </span>
              {/* T10: Quicksand Bold 13/12, #FFFFFF. */}
              <span className="ws-quick truncate text-[13px] leading-3 text-white">
                {leader.value}
              </span>
            </span>
          </span>
          {chip ? <LeaderChip chip={chip} /> : null}
        </div>
      ) : null}

      {children ? <div className="absolute inset-0 z-10">{children}</div> : null}
    </section>
  );
}
