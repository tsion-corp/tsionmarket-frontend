"use client";

// The featured market rotates on a timer, so this module holds client state.
// The directive is per file, so the red card ships to the browser alongside it.
// Both cards are static markup, so the cost is that markup, not new behaviour.

import { useCallback, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Carousel } from "@/components/ui/carousel";
import { useRotatingIndex } from "@/hooks/use-rotating-index";
import { formatCountdown, useCountdown } from "@/hooks/use-countdown";
import { DiscoveryRow } from "@/features/discovery/components/discovery-row";
import { DiscoveryCta } from "@/features/discovery/components/discovery-cta";
import { SeeMoreCard } from "@/features/discovery/components/see-more-card";
import type { PredictionSpot } from "@/features/discovery/types";

/*
 * The designer drew this row in a 1015px column: 481px for the yellow card,
 * 491px for the red one. The dashboard gives it up to 1456px, so anything drawn
 * at a design pixel offset would leave the card half empty. Every backdrop
 * layer is therefore sized as a share of the card it fills. The clouds are the
 * exception to "size it to the box": a cloud is a recognisable shape, so it
 * scales uniformly and lets the surplus clip at the card edge. Only the two
 * sunbursts, which are nothing but rays, are allowed to stretch. The
 * photographs keep their size, because the card's 222px height fixes their
 * vertical crop.
 */

/** 441 of the yellow card's 481px: the sunburst stops short of the right edge. */
const YELLOW_SUNBURST_WIDTH = "91.6840%";

/*
 * The sky: a star field over a cloud bank sitting on the card's bottom edge.
 * `cover` scales it uniformly and the bottom anchor keeps the bank on the edge,
 * so the surplus height clips off the top, where there is nothing but stars.
 * The 2% bleed on each side hides the bank's own silhouette, which curves in at
 * both ends: at the design width the card's 15px corner radius covers that
 * notch, but a uniformly scaled bank carries a wider notch than the radius.
 * Measured over a contrasting card colour inside the rounded clip, the bank
 * leaves no exposed pixel at any width from 360px to 1200px.
 */
const CLOUD_BACKDROP =
  "pointer-events-none absolute inset-y-0 -right-[2%] -left-[2%] block bg-[url('/market/prediction-cloud-backdrop.svg')] bg-bottom bg-cover bg-no-repeat";

// The small cloud the designer repeats three times across the yellow card, at
// three sizes. Left and width are shares of the card so the puffs scale with
// the sky behind them; the height follows from the width, so they keep their
// shape. Top stays in pixels, because the card's height does not change.
const CLOUD_PUFFS = [
  { left: "33.4720%", top: 8, width: "9.5811%" },
  { left: "46.1538%", top: 17, width: "11.3733%" },
  { left: "54.8857%", top: 53, width: "21.5293%" },
] as const;

/*
 * The headline. The design draws it 197px wide in a card 481px across, and it
 * grows with the card, so a wider card gives a longer locale more room rather
 * than more lines. The share looks wrong against the design measurement because
 * a max-width percentage resolves against the padded content box, which is 52px
 * narrower than the card. The last term keeps the text clear of the photo
 * collage, which starts at 79.5218% of the card less half its own 133px width.
 *
 * That last term used to leave the design's own 5px, which is the only clearance
 * the text gets on any card narrower than 481px, where it is the term that binds.
 * Five pixels read as text pushed up against the picture: measured on the one-up
 * carousel slide a 375px phone gives (a 281px card), the longest line ran to
 * 6.4px of the photo edge, and on the 1024px breakpoint's 426px slide to 5.2px.
 * The clearance is now 14px, which holds at every width below 481px and costs
 * nothing above it, where the headline's own share is the smaller term. 51.15 is
 * the fixed part of the collage offset once the 26px left padding is taken out,
 * so the constant is that plus the clearance.
 */
const PHOTO_CLEARANCE = "calc(79.5218% - 65.15px)";
const HEADLINE_WIDTH = `min(max(197px, 45.9207%), ${PHOTO_CLEARANCE})`;

/*
 * The red card's headline: 200px of the panel's 445px in the design, growing
 * with the panel. 230px is the floor rather than the design's 200px because
 * French and Spanish need it to stay on two lines at the widths the dashboard
 * actually gives the card.
 *
 * The share is quoted against the panel's content box, not the panel, because
 * the panel now carries 20px gutters. Without them the headline is capped only
 * by `max-w-full`, and on a 281px card that put the French and Spanish titles
 * 3.5px from the white edge on both sides. 200 of the 405px left inside the
 * design's 445px panel is 49.3827%, so the design's own 200px is unchanged.
 */
const RED_TITLE_GUTTER = "px-[20px]";
const RED_TITLE_WIDTH = "max(230px, 49.3827%)";

/** The photo pair's centre, 382.5 of 481px, and half the pair's own width. */
const COLLAGE_LEFT = "calc(79.5218% - 66.5px)";

// A card is now a carousel slide rather than a grid column. The slide sets the
// width, so the card takes it from the block it is in; h-full squares it up
// against the taller slide in view, and the design's height stays the floor.
const CARD_BOX = "relative h-full min-h-[222px] overflow-hidden rounded-[15px]";

// The collage: two square photos, each tilted the other way, the right one
// overlapping the left. Positions are the design's, measured inside the
// 133x87.677 box the pair occupies. Front is the one on top of the stack.
const COLLAGE = [
  { slot: "back", left: 3.97, top: 7.09, rotate: -6.61 },
  { slot: "front", left: 52.53, top: 7.21, rotate: 12.81 },
] as const;

// The Benny Hinn pair the design ships with, which is what the card shows until
// live markets reach it. A live market brings its own photos.
const FALLBACK_IMAGES = [
  "/market/prediction-event-back.png",
  "/market/prediction-event-front.png",
] as const;

/*
 * Which tiles to draw for a market's photos. The design is a pair, but a live
 * market can carry one photo or none.
 *
 * One photo takes the front tile alone: it is the top of the stack and the
 * outer of the two, so a lone photo lands where the collage already reads
 * rather than beside it. No photo draws nothing, because the design has no
 * placeholder to stand in and a bordered empty tile would look like a failed
 * image. Neither case touches the box the pair sits in, so the text column
 * keeps the PHOTO_CLEARANCE it is laid out against and the card does not
 * reflow around a market with fewer pictures than the design assumes.
 */
function collageTiles(images: readonly string[]) {
  if (images.length === 0) return [];
  if (images.length === 1) return [{ ...COLLAGE[1], src: images[0] }];
  return [
    { ...COLLAGE[0], src: images[0] },
    { ...COLLAGE[1], src: images[1] },
  ];
}

function CloudPuff({ left, top, width }: { left: string; top: number; width: string }) {
  return (
    <span aria-hidden style={{ left, top, width }} className="pointer-events-none absolute block">
      <img src="/market/prediction-cloud-puff.svg" alt="" className="block h-auto w-full" />
      {/* The lighter tuft the designer sits on the cloud's upper right. Both
          offset and size are shares of the puff, so all three sizes match. */}
      <img
        src="/market/prediction-cloud-puff-glow.svg"
        alt=""
        className="absolute top-[7.14%] left-[55.46%] block h-auto w-[35.77%]"
      />
    </span>
  );
}

interface PredictionMarketCardProps {
  /** The market on show, or null before any live market reaches the row. */
  market: PredictionSpot | null;
  /** Reports hover and focus so the row can hold the rotation still. */
  onHold: (held: boolean) => void;
}

// The featured market: a sunlit card carrying the countdown, the question and
// the two pills the design draws in a white bar along the foot. Only the chip,
// the headline, the collage, and where the card and the first pill lead follow
// the market. Everything else is fixed artwork.
function PredictionMarketCard({ market, onHold }: PredictionMarketCardProps) {
  const t = useTranslations("discovery");

  // The question is the market's own words and is deliberately not translated.
  // It is content, like a headline in a feed, and there is no message for it.
  // Do not "fix" this by wrapping it in `t`.
  const question = market ? market.question : t("predictionOneTitle");
  // The chip counts down to the market's real close time, ticking every second.
  //
  // It used to print `discovery.predictionCountdown`, a clock face typed into
  // the message catalogue and translated five ways, so every card on every
  // dashboard read 01:46:55:22 forever. The instant now comes from Gamma's
  // endDate through the route, and null still means null: a market with no
  // published deadline keeps the chip and reads "No deadline" rather than
  // counting to a time nobody set.
  //
  // Formatting happens here rather than in the adapter because this is the one
  // figure on the card that cannot be prepared upstream. It changes every
  // second, so only the view that ticks it can render it.
  const countdown = formatCountdown(useCountdown(market?.closesAt ?? null));
  const tiles = collageTiles(market ? market.images : FALLBACK_IMAGES);

  return (
    // WCAG 2.2.2 (Pause, Stop, Hide): the card changes itself every ten
    // seconds, so it has to be stoppable. Hover or focus anywhere on it holds
    // the rotation. React's focus and blur bubble, so a pill taking focus
    // inside the card counts, which is the focus-within half of the rule.
    <article
      onPointerEnter={() => onHold(true)}
      onPointerLeave={() => onHold(false)}
      onFocus={() => onHold(true)}
      onBlur={() => onHold(false)}
      className={`${CARD_BOX} flex flex-col bg-[linear-gradient(180deg,#fee685_0%,#ffd425_100%)]`}
    >
      {/* Sun rays first, then the sky over them. The rays are the one layer
          here that may stretch: they are drawn from a single point, so a
          wider card only widens the angles between them. */}
      <img
        src="/market/prediction-sunburst-yellow.svg"
        alt=""
        aria-hidden
        style={{ width: YELLOW_SUNBURST_WIDTH }}
        className="pointer-events-none absolute top-0 left-0 block h-full"
      />
      <span aria-hidden className={CLOUD_BACKDROP} />
      {CLOUD_PUFFS.map((puff) => (
        <CloudPuff key={puff.left} {...puff} />
      ))}

      {/* The photos hold their design size. The card's 222px is a floor rather
          than a height, but the collage is pinned to the head of the card, and
          scaling it with the width would push it into the text beside it. */}
      {tiles.length > 0 && (
        <span
          aria-hidden
          style={{ left: COLLAGE_LEFT }}
          className="pointer-events-none absolute top-[15px] block h-[87.677px] w-[133px]"
        >
          {tiles.map((tile) => (
            <span
              key={tile.slot}
              style={{
                left: tile.left,
                top: tile.top,
                transform: `rotate(${tile.rotate}deg)`,
              }}
              className="absolute block size-[73.255px] overflow-hidden rounded-[11.934px] border-[2.271px] border-white"
            >
              {/* A live market's photos are arbitrary URLs at whatever aspect
                  ratio the source has. `object-cover` in the fixed square is
                  what stops a portrait or a landscape one stretching a face:
                  it crops instead, from the top, where a face sits in a press
                  photo. The width and height attributes stay the tile's, since
                  the CSS sizes the image either way. */}
              <img
                src={tile.src}
                alt=""
                width={73.255}
                height={73.255}
                className="block size-full object-cover object-top"
              />
            </span>
          ))}
        </span>
      )}

      {/* The whole card opens the market, not just the pill in the white bar.
          It is a link rather than a button because it goes to a route, so it
          gets middle-click, open-in-new-tab and copy-link for nothing.

          It cannot wrap the card: the white bar holds two pills that are links
          themselves, and an anchor inside an anchor is invalid and drops out of
          the tab order. So the link is an empty box stretched over the card and
          the layers that carry the pills sit above it, which is the same
          arrangement the markets discovery card uses. It is laid out here, after
          the artwork and before the text, so DOM order alone keeps it under
          them and no layer needs a z-index it did not have before.

          Its accessible name is the market's own question. That is what names
          this card apart from the one beside it; "Predict Now", which is all a
          screen reader gets from the pill today, does not. The destination
          follows the first pill, including its fallback, so the card and the
          pill can never lead to two different places. */}
      <Link
        href={market ? market.href : "/prediction"}
        aria-label={question}
        className="absolute inset-0 rounded-[15px] outline-none focus-visible:ring-2 focus-visible:ring-[#0b0a0a]"
      />

      {/* The bottom padding is not slack the design left over, it is the gap
          itself. The column is `flex-1`, so on a card at its 222px floor it has
          room to spare, but every locale except English already fills the
          column at the shipped width and the card grows to fit. Without a
          bottom padding the body's last line finished 3.1px above the white
          bar in French, Spanish, German and Portuguese, and 1px at the narrower
          slide widths. */}
      {/* `pointer-events-none` hands the column's clicks to the stretched link
          under it. Nothing in here is interactive, and the article still sees
          the pointer events it needs for the rotation hold: they come off the
          link instead and bubble the same way. */}
      <div className="pointer-events-none relative flex-1 px-[26px] pt-[18px] pb-[14px]">
        {/* The chip's gutters are the design's and stay: 10.611px each side of
            8.917px type is 1.19em, wider in proportion than the 8/7em every
            discovery pill gets, and the countdown is a fixed-width digit
            string, so no locale can crowd it. Measured at 93.5x29 with 11.6px
            to the right of the last digit. The no-deadline label is the one
            string here a locale can lengthen, and the pill is `w-fit`, so it
            widens the pill instead of pressing on the gutters. */}
        <span className="flex w-fit items-center gap-[3.032px] rounded-full border-[0.505px] border-[#0b0a0a] bg-[#ffdc50] px-[10.611px] py-[7.431px]">
          {/* The glyph is 9.8535x10.8641 inside a 12.127px frame. Drawing it
              at its own size in that frame keeps the dial round. The 3.032px
              gap that follows reads wider than it measures: the dial is inset
              1.14px inside its own frame. */}
          <span
            aria-hidden
            className="block size-[12.127px] shrink-0 bg-[url('/market/prediction-stopwatch.svg')] bg-[length:9.8535px_10.8641px] bg-center bg-no-repeat"
          />
          {/* A market with no deadline, and the sample that stands in before
              any market arrives, keep the chip and swap the clock for a word.
              Dropping the chip would take 38px out of the head of the
              card and lift the headline, the body and the collage relationship
              with it, and the design's geometry starts at this chip. The
              stopwatch stays: the pill still says what the clock is doing. */}
          <span className="tnum font-serif text-[8.917px] leading-[1.1] font-semibold tracking-[0.6242px] text-[#0b0a0a]">
            {countdown ?? t("predictionNoDeadline")}
          </span>
        </span>
        <h3
          style={{ maxWidth: HEADLINE_WIDTH }}
          className="ws-poster mt-[9px] text-[16px] leading-[1.31] tracking-[-0.32px] break-words text-[#252525]"
        >
          {question}
        </h3>
        {/* Nothing under the headline. The design drew a line of body copy
            there and what it drew was advice: `discovery.predictionOneBody`
            read "ETH is up 3.5% in the last 6 hours. I recommend increasing
            your position by 10%". It quoted a move no feed produced, over a
            window this app does not have (the only change we carry is 24
            hours), told the reader to add to a position, and did all of it
            under a headline about whether a preacher will appear at an event.
            It was translated into all five locales, so it shipped as a
            recommendation in five languages. This card does not author advice
            and does not print a figure nothing measured.

            What is left is what the market actually gives us. `PredictionSpot`
            carries the question, the countdown, the photos and the
            destination, and the card already draws all four, so there is no
            sentence left to write from real data. A body needs the market to
            bring one: add a field to `PredictionSpot`, formatted upstream like
            every other figure on this shelf, and render it here.

            The column keeps the slack that leaves, and the headline keeps the
            design's measure rather than widening into it: a wider measure
            takes lines off the question, which opens the gap above the white
            bar instead of closing it. Measured with the 14px bottom padding, a
            question of two lines or more leaves 18px and a one-line question
            39px, which is the card sitting at its 222px floor with less copy
            on it. Both at 481px and at the 660px the dashboard gives a
            slide. */}
      </div>

      {/* 82px is the design's bar, and the floor rather than the height: a
          locale whose label will not sit on one line wraps it and the bar
          grows to hold it. */}
      {/* The bar itself is transparent to the pointer so the space around the
          pill belongs to the stretched link, the same as the rest of the card.
          The pill takes its own clicks back. */}
      <div className="pointer-events-none relative flex min-h-[82px] flex-wrap items-start bg-white/60 px-[22px] py-[12px]">
        {/* The padding override stays. `DiscoveryCta` now derives its gutters
            from the label size, and at 15px that gives 17.143 by 10.714. The
            design draws this pill larger than its type: 21.214px around the
            label, of which 0.643 is the border, in a pill 45px tall. Dropping
            the override would take 6.9px off the width and 4.3px off the
            height, so it is the more generous of the two and the one the
            designer measured. The glyph gap is left to the scale. */}
        {/* One pill, and it leads to the market on show. The desk itself is
            where the row's heading goes. */}
        <DiscoveryCta
          href={market ? market.href : "/prediction"}
          label={t("predictNow")}
          tone="light"
          size={15}
          padding="px-[20.571px] py-[12.857px]"
          className="pointer-events-auto border-[0.643px] border-[#fee685] tracking-[-0.15px]"
          icon={
            <img
              src="/market/prediction-coins-black.svg"
              alt=""
              aria-hidden
              width={18}
              height={18}
              className="block size-[18px] shrink-0"
            />
          }
        />
      </div>
    </article>
  );
}

// The title-fight market: a red card carrying a white panel, with the cut-out
// of the two boxers and its pill centred over the panel's lower edge.
function TitleFightCard() {
  const t = useTranslations("discovery");

  return (
    <article className={`${CARD_BOX} bg-[linear-gradient(180deg,#ed2b07_0%,#ff846e_100%)]`}>
      {/* The rays run well past the card on every side in the design. Each
          edge is a share of the card, so they still overhang it whole. */}
      <img
        src="/market/prediction-sunburst-red.svg"
        alt=""
        aria-hidden
        className="pointer-events-none absolute top-[-33.5709%] left-[-30.8163%] block h-[205.4856%] w-[136.0680%] max-w-none"
      />

      {/* The white panel runs off the bottom of the card in the design, so
          its lower corners never show. The right margin really is wider
          than the left: that is how the designer drew it. */}
      <div
        className={`absolute top-[13px] right-[33px] bottom-[-2px] left-[13px] overflow-hidden rounded-[16px] bg-white ${RED_TITLE_GUTTER} pt-[30px]`}
      >
        <h3
          style={{ width: RED_TITLE_WIDTH }}
          className="mx-auto max-w-full text-center font-serif text-[17px] leading-[19px] font-semibold tracking-[-0.34px] break-words text-[#494949]"
        >
          {t.rich("predictionTwoTitle", {
            strong: (chunks) => <strong className="font-bold text-black">{chunks}</strong>,
          })}
        </h3>
      </div>

      {/* The cut-out and the pill move together. At the design width they
          land where the mockup puts them, the photo at 22,56 and 385x257;
          wider, they stay centred rather than drifting to one edge. The
          photo keeps its size: scaling it up would crop the punch away.

          It hangs off the card's foot rather than sitting 56px from its head,
          which is the same place at the design's 222px and a different one on
          a card that has grown. The pill was already bottom-anchored, so the
          two came apart as soon as a longer locale made the row taller, and
          the boxers walked up into the headline: on a 281px slide the French
          and Spanish titles landed on their heads. Bottom-anchored, the photo,
          the pill and the card's foot keep the one relationship the design
          draws. 91.18 is how far the 257.18px photo overhangs a 222px card. */}
      <div className="pointer-events-none absolute inset-y-0 left-[calc(50%_-_223.5px)] w-[385px]">
        <img
          src="/market/prediction-boxers.png"
          alt=""
          aria-hidden
          width={385}
          height={257.18}
          className="absolute -bottom-[91.18px] left-0 block h-[257.18px] w-[385px] max-w-none"
        />
        {/* The design puts the pill at 147px in the 385px photo, which is
            where the boxers themselves centre: their pixels run 26.18px to
            368.83px across it. Centring there lets a longer label grow both
            ways instead of off the card. */}
        <DiscoveryCta
          href="/prediction"
          label={t("predictNow")}
          tone="dark"
          size={12}
          className="pointer-events-auto absolute bottom-[16px] left-[51.3%] w-max -translate-x-1/2 border-[0.5px] border-[#ed2b07] tracking-[-0.12px]"
          icon={
            <img
              src="/market/prediction-coins-white.svg"
              alt=""
              aria-hidden
              width={14}
              height={14}
              className="block size-[14px] shrink-0"
            />
          }
        />
      </div>
    </article>
  );
}

// "Your Next Prediction Starts Here": two open markets, both leading to the
// prediction desk.
//
// The yellow card is the live one. It cycles through `markets` on a ten second
// timer, taking the countdown, the question, the collage and the first pill's
// destination from whichever market is up. Everything else on the card is fixed
// geometry and artwork. With no markets it renders the design's own sample: the
// Benny Hinn question and the two committed photos, with no clock, because there
// is no market whose deadline it could be showing. That sample is what the
// preview harness and the tests see, and what ships until a markets feed reaches
// the dashboard.
//
// Nothing rotates until the route hands this row markets. `app/(session)/(app)/
// dashboard/dashboard-page.tsx` renders it with none, so the dashboard shows the
// sample and runs no timer. The row cannot fetch them itself: discovery must not
// reach into the prediction feature, so the route maps its own hook's markets
// into `PredictionSpot` and passes them in, the way it already does for the
// token and memecoin shelves.
//
// Every clickable on the row is a `DiscoveryCta`, the heading link, or the
// market card's own stretched link, and the first two take their hover from
// `ws-pressable`. Nothing on these cards declares a hover of its own, and
// nothing carries a shadow at rest or on hover.
//
// The pair rides a carousel, and two cards cannot cycle, so the market card is
// dealt twice. It is the only card on the row carrying a clock, so it is the
// one the heading's "next" actually refers to; the title fight has no deadline
// on it. The repeat is third rather than second so the first two views are both
// a genuine pair. Both copies show the same market, which is the one card
// twice, as it has always been on this row. The shelf then closes on the end
// cap, which is the only slide here that leaves for the prediction desk.
export function PredictionStartsRow({ markets = [] }: { markets?: readonly PredictionSpot[] }) {
  const t = useTranslations("discovery");

  // WCAG 2.2.2 (Pause, Stop, Hide): the card updates itself and runs longer
  // than five seconds, so it needs a way to stop. Hover and focus-within on the
  // card are it. The hold is a count rather than a flag because the card is on
  // the row twice and the carousel clones its slides, so several copies can
  // report at once and a pointer leaving one must not release the hold a
  // keyboard has on another. Clamped at zero so a leave without its enter,
  // which is what a slide going inert mid-hover would send, cannot latch it.
  const [holds, setHolds] = useState(0);
  const hold = useCallback((held: boolean) => {
    setHolds((open) => Math.max(0, held ? open + 1 : open - 1));
  }, []);

  // Ten seconds is the hook's own default and the cadence this row was asked
  // for. The hook clamps its index, so it is in range whenever there is one.
  const rotation = useRotatingIndex(markets.length, { paused: holds > 0 });
  const featured = markets.length > 0 ? markets[rotation] : null;

  return (
    <DiscoveryRow
      title={t.rich("predictionTitle", {
        accent: (chunks) => <span className="text-[#ffd62f]">{chunks}</span>,
      })}
      href="/prediction"
    >
      <Carousel label={t("predictionCarousel")} gapPx={28} trimPx={50}>
        <PredictionMarketCard market={featured} onHold={hold} />
        <TitleFightCard />
        <PredictionMarketCard market={featured} onHold={hold} />
        <SeeMoreCard headline={t("predictionSeeMore")} href="/prediction" className={CARD_BOX} />
      </Carousel>
    </DiscoveryRow>
  );
}
