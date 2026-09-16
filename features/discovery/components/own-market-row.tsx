"use client";

import { useTranslations } from "next-intl";
import { DiscoveryCta } from "@/features/discovery/components/discovery-cta";
import { DiscoveryRow } from "@/features/discovery/components/discovery-row";
import { across, artLayer } from "@/features/discovery/components/conversation-card";

// The arena copy sits a third of the way across the card. The offset is a
// spacer rather than a left edge because it is the part that gives way: the
// headline is a single 40px line in the design and a longer locale needs more
// room than the design leaves to the right of x=153, so the spacer shrinks and
// slides the whole column left before anything has to wrap.
const ARENA_COPY_INSET = across(153);
// Below md the card is a phone's width, where a third of it is most of the
// line, so the spacer gives way and the column starts nearer the edge.
const ARENA_COPY_INSET_PHONE = across(64);

interface ArenaOrb {
  src: string;
  width: number;
  height: number;
  /** Centre of the export, in design pixels across the card. */
  centre: number;
  top: number;
}

// Listed in the design's paint order, which draws the right orb first. The two
// orbs sit on the trend curve near the card's edges; each export is the orb
// plus its glow, so the figure it centres on is the box centre.
const ARENA_ORBS: ArenaOrb[] = [
  {
    src: "/market/convo-arena-orb-right.svg",
    width: 19,
    height: 19,
    centre: 449.669,
    top: 82.0845,
  },
  { src: "/market/convo-arena-orb-left.svg", width: 31, height: 32, centre: 39.1086, top: 87 },
];

// The leverage desk's doorway, in the layers the design draws it in. The card
// is drawn at 482px and rendered half again as wide, so every layer has to say
// what it does with the extra width.
//
// Star dust, trend curve and ray burst are backdrop and stretch with the card.
// The coin stack and the orbs are round and may not: the stack keeps its
// proportions and grows off the bottom edge, which is already a crop, so it
// still reaches both sides at any width; the orbs hold the size they were drawn
// at and ride the curve at a fixed share across, where the stretched curve
// still passes through them.
//
// Two of the layers blend rather than paint over: the dust is plus-lighter and
// the stack's glow is screen. An img is its own stacking context, so both
// blends are set on the element, not left inside the export where they would
// have nothing under them.
//
// The layers are vector art, which next/image has nothing to optimise.
/* eslint-disable @next/next/no-img-element */
function ArenaCard() {
  const t = useTranslations("discovery");

  return (
    <article className="relative h-[204px] overflow-hidden rounded-[18px] bg-[linear-gradient(0deg,#7724bb_0%,#deb5ff_100%)]">
      <img
        src="/market/convo-arena-stars.svg"
        alt=""
        aria-hidden
        width={482}
        height={204}
        className={`${artLayer} inset-0 h-full w-full mix-blend-plus-lighter`}
      />
      <img
        src="/market/convo-arena-trend.svg"
        alt=""
        aria-hidden
        width={482}
        height={158}
        className={`${artLayer} top-[46.055px] left-0 h-[158px] w-full`}
      />
      {/* Width and bottom, never a right offset: an img given both offsets and
          no width falls back to its intrinsic size and ignores the far one. */}
      <img
        src="/market/convo-arena-coins.svg"
        alt=""
        aria-hidden
        width={482}
        height={121}
        className={`${artLayer} bottom-0 left-0 h-auto w-full`}
      />
      <img
        src="/market/convo-arena-coin-glow.svg"
        alt=""
        aria-hidden
        width={482}
        height={121}
        className={`${artLayer} bottom-0 left-0 h-auto w-full mix-blend-screen`}
      />
      {ARENA_ORBS.map((orb) => (
        <img
          key={orb.src}
          src={orb.src}
          alt=""
          aria-hidden
          width={orb.width}
          height={orb.height}
          style={{
            left: `calc(${across(orb.centre)} - ${orb.width / 2}px)`,
            top: orb.top,
            width: orb.width,
            height: orb.height,
          }}
          className={artLayer}
        />
      ))}
      <img
        src="/market/convo-arena-rays.svg"
        alt=""
        aria-hidden
        width={482}
        height={204}
        className={`${artLayer} inset-0 h-full w-full`}
      />

      {/* Headline, body and pill are one column in the design, so they travel
          together and keep the offsets they have from each other. They stack in
          flow rather than at three absolute tops: the offsets below reproduce
          the design's 21px, 69px and 105.73px exactly for a one-line headline
          and a two-line body, and a locale that needs another line of either
          pushes what follows down instead of landing on top of it.
          The 18px padding is the gutter the column stops at on the right, and
          it hangs off the column rather than the row so that the row's width
          stays the card's and the spacer keeps resolving against it. The design
          leaves 10px, which is the slack a short English headline happens to
          end at, not a margin: "Entrez dans l'arène" is long enough to reach
          the gutter, and 18px is what keeps it off the card's edge.
          The spacer never closes all the way. It is what gives way as the
          headline grows, but at zero the headline would start at the card's
          left edge, so it keeps an 18px gutter of its own and the column is
          capped to what is left beside it. */}
      <div className="absolute inset-y-0 left-0 flex w-full items-start">
        <div className="min-w-[14px] shrink md:hidden" style={{ width: ARENA_COPY_INSET_PHONE }} />
        <div className="hidden min-w-[18px] shrink md:block" style={{ width: ARENA_COPY_INSET }} />
        <div className="max-w-[calc(100%-18px)] shrink-0 pt-[21px] pr-[18px]">
          {/*
           * The design's drop shadow, and it has to be a filter. `text-shadow`
           * paints above the element's own background, and the fill here is a
           * background clipped to the glyphs, so the purple lands on top of the
           * letters and turns them the colour of the card. `drop-shadow` takes
           * the element as already painted and puts the shadow behind it, which
           * is what Figma draws.
           *
           * w-fit keeps the gradient box the width of the glyphs it is clipped
           * to, whatever the column around it ends up. The card is drawn 204px
           * tall and stays that, so the two clamps here and on the body are what
           * keep a long locale off the coin stack: two lines of headline and two
           * of body is the tallest stack the card has room for.
           */}
          <h3
            className="ws-poster ws-arena-ink ml-[4.563px] line-clamp-2 w-fit text-[26px] leading-[1.2] tracking-[-0.5px] text-balance capitalize md:text-[40px] md:tracking-[-0.8px]"
            style={{ filter: "drop-shadow(0 3.397px 3.397px #b46cf0)" }}
          >
            {t("arenaTitle")}
          </h3>
          <p className="ml-[1.563px] line-clamp-2 w-[250px] max-w-full font-serif text-[11.5px] leading-normal font-semibold tracking-[-0.23px] text-white md:text-[13px] md:tracking-[-0.26px]">
            {t("arenaBody")}
          </p>
          {/* The pill is inline-flex, so it goes in a block of its own: on a
              line of its own it would pick up leading above and below and lose
              the 6.73px the design leaves under the body copy. */}
          <div className="mt-[6.73px] flex">
            <DiscoveryCta
              href="/perps"
              label={t("arenaCta")}
              tone="light"
              size={12}
              icon={
                <img
                  src="/market/convo-icon-coins.svg"
                  alt=""
                  aria-hidden
                  width={12}
                  height={12}
                  className="size-[12.012px] shrink-0"
                />
              }
              className="border-[0.479px] border-[#9e5ad0] tracking-[-0.12px]"
            />
          </div>
        </div>
      </div>
    </article>
  );
}
/* eslint-enable @next/next/no-img-element */

// "Own The Market.": the perps desk's own shelf on the dashboard, beside the
// shelves the other services get. The heading leads to the desk, and so does
// the card under it.
export function OwnMarketRow() {
  const t = useTranslations("discovery");

  return (
    <DiscoveryRow
      title={t.rich("ownMarketTitle", {
        accent: (chunks) => <span className="text-[#deb5ff]">{chunks}</span>,
      })}
      href="/perps"
    >
      {/* The card is drawn at 482px and the band it came from gave it about a
          carousel slide of a 1456px column. It keeps that width here: stretched
          across a whole shelf the coin stack, which is proportional, grows to
          three times the card's height and swallows the copy. */}
      <div className="max-w-[720px]">
        <ArenaCard />
      </div>
    </DiscoveryRow>
  );
}
