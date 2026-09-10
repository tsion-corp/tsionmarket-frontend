"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Carousel } from "@/components/ui/carousel";
import { DiscoveryRow } from "@/features/discovery/components/discovery-row";
import { DiscoveryCta } from "@/features/discovery/components/discovery-cta";
import type { TokenSpot } from "@/features/discovery/types";
import { useRotatingIndex } from "@/hooks/use-rotating-index";

// Every illustration on these cards is a Figma export under public/market.
// They are decorative, so they carry no alt text and never take a click.
//
// The design draws both cards 263px tall on a 1015px content column; the
// dashboard gives them the same height in a column half again as wide, so the
// artwork has to answer a card that is much wider but no taller.
//
// Only the cloud bank stretches. It is sky, so widening it reads as more sky.
// Everything figurative keeps its aspect ratio and is anchored instead: the
// coins scale whole with the card, the crowd holds the size it is drawn at, and
// between them they still cover the card. The discrete pieces on top (the
// rocket, the sparkles, the ticker, the tip, the pills) keep the size they are
// drawn at and hold the card edge they are drawn against.
const artLayer = "pointer-events-none absolute select-none";

// A card is now a carousel slide rather than a grid column. The slide sets the
// width, so the card takes it from the block it is in and never asks for one of
// its own; h-full squares it up against the taller slide in view, and the
// design's height stays the floor.
const CARD_BOX = "relative h-full min-h-[263px] overflow-hidden rounded-[18px]";

// How long one token holds the card. The design asks for ten seconds, which is
// also the rotation hook's own default; it is named here because it is a
// product decision about this card, not a detail of the hook.
const TOKEN_HOLD_MS = 10_000;

// The move's colour on the white ticker chip. The green is the one the design
// draws. There is no red drawn for this chip, because the design only ever
// shows a gainer here, so a loss borrows the redesign's own red, the one the
// stake banner is filled with. Both sit on white at about the same weight.
const GAIN_INK = "text-[#5aad00]";
const LOSS_INK = "text-[#ed2b07]";

// The card's own yellow, named because the loading placeholder is the same
// card and has to be drawn in it too.
const TOKEN_CARD_BG = "bg-[linear-gradient(124deg,#ffd52d_37%,#f5c500_88%)]";

// What stands where a price should be when the route did not have one. A dash,
// never a number: a figure here would be read as the price of the token whose
// symbol is sitting next to it.
const MISSING_FIGURE = "\u2014";

/**
 * Whether the route actually sent this figure.
 *
 * The row is handed display-ready strings, so a figure the route did not have
 * arrives as an empty string rather than as null or NaN. A blank one is never
 * drawn as though it were a number.
 */
function present(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim() !== "";
}

/**
 * Whether a display-ready percentage is exactly zero.
 *
 * The card never sees the raw number, so flat has to be read off the string.
 * The five locales write the same figure differently ("0.0%", "0,00 %"), but
 * all of them write a zero move with zeros and nothing else, so the digits are
 * what is checked. No arithmetic, and no per-locale table to keep in step.
 */
function zeroPercent(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  return digits !== "" && !/[1-9]/.test(digits);
}

/** Which of the four sentences the tip reads. */
type MoveTone = "up" | "down" | "flat" | "unknown";

/**
 * The move the tip can honestly claim.
 *
 * A zero is not a fact about the market unless the market said so. The spot
 * composition upstream defaults a missing 24h change to 0, so a token the price
 * feed has never heard of would otherwise reach this card looking exactly like
 * a token that genuinely did not move, and be announced as "is up 0.0%". The
 * route's job is to send a blank `movePercent` for the first case; a blank one
 * is read here as unknown and gets a sentence that claims nothing, and only a
 * figure the route really had can produce "flat", "up" or "down".
 */
function moveTone(token: TokenSpot): MoveTone {
  if (!present(token.movePercent)) return "unknown";
  if (zeroPercent(token.movePercent)) return "flat";
  return token.up ? "up" : "down";
}

// The bold clause inside the tip. Both message namespaces mark it, so the same
// renderer serves the discovery <strong> tag and the markets <b> tag.
function emphasis(chunks: ReactNode) {
  return <strong className="font-semibold text-[#060606]">{chunks}</strong>;
}

// The launch artwork: the spark, the moon glow, the cloud bank, the rocket and
// the stars. Shared by the live card and the loading placeholder, so the two
// are the same picture and only the copy on top of it differs.
function TokenCardArt() {
  return (
    <>
      <img
        src="/market/token-launch-spark.svg"
        alt=""
        aria-hidden
        className={`${artLayer} top-[131.7px] right-[178.69px] h-[29.7px] w-[30.66px]`}
      />
      {/* The moon glow is a soft ring stack centred near the card's lower
          left, so it keeps its drawn size and hangs off that corner. */}
      <img
        src="/market/token-launch-glow.svg"
        alt=""
        aria-hidden
        className={`${artLayer} top-[-171.68px] left-[-263.45px] h-[855.47px] w-[774.51px]`}
      />
      {/* The cloud bank is the card's backdrop and has to reach both edges. */}
      <img
        src="/market/token-launch-clouds.svg"
        alt=""
        aria-hidden
        className={`${artLayer} inset-0 h-full w-full`}
      />
      <img
        src="/market/token-rocket.svg"
        alt=""
        aria-hidden
        className={`${artLayer} top-0 right-0 h-full w-[258px] max-w-[53.53%] object-cover object-[right_center]`}
      />
      <img
        src="/market/token-launch-stars.svg"
        alt=""
        aria-hidden
        className={`${artLayer} top-[9.09px] right-[23.18px] h-[151.09px] w-[127.82px]`}
      />
    </>
  );
}

interface TokenCallCardProps {
  token: TokenSpot;
  /** Called with true while the pointer or focus is on this card. */
  onHold: (held: boolean) => void;
}

// The call on one token: a rocket over a moon glow and a cloud bank, with the
// ticker, the tip and the buy pill laid over it. The rocket and its sparkles are
// drawn against the card's right edge, the copy against its left.
//
// Only the words move. The token supplies the logo, the symbol, the price, the
// move and the destination; the artwork, the geometry and the colours are the
// same card whichever token is featured.
function TokenCallCard({ token, onHold }: TokenCallCardProps) {
  const t = useTranslations("discovery");
  // The flat and unknown sentences live under `markets`; see the tip below.
  const tMarkets = useTranslations("markets");

  const hasPrice = present(token.price);
  const hasDelta = present(token.change);
  const tone = moveTone(token);

  return (
    <article
      // WCAG 2.2.2: the card updates itself, so a reader needs a way to stop
      // it. Pointing at the card or tabbing into it holds the token in place
      // until the pointer or the focus leaves. onFocus and onBlur are React's
      // focusin and focusout, so they cover anything focused inside the card,
      // not just the card itself.
      onMouseEnter={() => onHold(true)}
      onMouseLeave={() => onHold(false)}
      onFocus={() => onHold(true)}
      onBlur={() => onHold(false)}
      className={`${CARD_BOX} ${TOKEN_CARD_BG}`}
    >
      <TokenCardArt />

      {/* The ticker chip, tilted as drawn. It sizes to its own text so a
          longer locale, or a longer symbol, extends it rather than clipping
          the figure.

          Its left inset is the design's 107.14px, which is 22.23% of the
          482px card it is drawn on. Below that width the percentage wins and
          the chip comes in with the card, so the longest ticker still ends
          inside the card instead of behind its right edge. The max-width is
          the backstop for a string longer than any locale ships. */}
      <div className="absolute top-[55.47px] left-[min(107.14px,22.23%)] flex w-fit max-w-[calc(100%_-_min(107.14px,22.23%)_-_14px)] rotate-[-3.07deg] items-center gap-[8.55px] rounded-[9.98px] bg-white p-[8.55px]">
        {/* The coin and the ticker never give up width, so symbol, price and
            move stay on the one line the design draws them on. */}
        <div className="flex shrink-0 items-center gap-[8px]">
          {token.logo ? (
            // Rounded because a listing logo is not always drawn round, and
            // the slot the design leaves for it is.
            <img
              src={token.logo}
              alt=""
              aria-hidden
              className="size-[34.22px] shrink-0 rounded-full object-cover"
            />
          ) : (
            // A token with no logo still gets the disc, so the chip keeps its
            // width and the line below it does not shift.
            <span
              aria-hidden
              className="flex size-[34.22px] shrink-0 items-center justify-center rounded-full bg-[#f4f4f4] font-serif text-[11px] font-semibold text-[#656464]"
            >
              {token.symbol.slice(0, 3)}
            </span>
          )}
          <div>
            <p className="font-serif text-[12px] leading-[1.1] font-semibold tracking-[-0.12px] text-black">
              {token.symbol}
            </p>
            {/* The price is grey and the move is coloured. The colour comes
                from the <change> tag; without it next-intl returns the line
                whole and it stays grey.

                A price the route did not have is a dash. A move it did not
                have is nothing at all, not a zero and not a placeholder: this
                line is one of two things on the card anybody reads as a
                number, and a percentage printed here is a claim about the
                market. Without a move the line is the price on its own, which
                is why it does not go through the two-slot message. */}
            <p className="tnum text-[12px] leading-normal font-semibold text-[#9b9b9b]">
              {hasDelta ? (
                t.rich("tokenTicker", {
                  price: hasPrice ? token.price : MISSING_FIGURE,
                  delta: token.change,
                  change: (chunks) => (
                    <span className={`font-medium ${token.up ? GAIN_INK : LOSS_INK}`}>
                      {chunks}
                    </span>
                  ),
                })
              ) : (
                <span>{hasPrice ? token.price : MISSING_FIGURE}</span>
              )}
            </p>
          </div>
        </div>
        {/* The design's wide gap between the ticker and the avatar. It is the
            one piece of pure space in the chip, so it is what gives when the
            card is too narrow to hold the chip at its drawn width. The shrink
            factor is what puts it first in line: space closes to nothing
            before a single word of the ticker is asked to wrap. */}
        <span aria-hidden className="w-[25.67px] shrink-[999]" />
        <img
          src="/market/token-ticker-avatar.png"
          alt=""
          aria-hidden
          className="size-[22.81px] shrink-0"
        />
      </div>

      {/* The tip and the buy pill are the one part of this card that a
          locale can lengthen, so they run down the page instead of holding
          two fixed tops: a longer tip takes the lines it needs and carries
          the pill down with it. At English the block still lands on the
          design's 110.09px and 191.09px, and the card on its 263px. */}
      <div className="relative flex flex-col items-start pt-[110.09px] pr-6 pb-6 pl-[64px]">
        {/* 76.1px is the slot the design leaves the tip: three lines at
            13/1.5 plus its own 8px and 9.6px. Holding it here rather than on
            the tip itself keeps the white pill tight to its text. */}
        <div className="min-h-[76.1px] w-[262.59px] max-w-full">
          <p className="rounded-[11.97px] bg-white pt-[8px] pr-[17.6px] pb-[9.6px] pl-[39px] text-[13px] leading-normal font-medium text-[#656464]">
            {/* A gain and a loss are two whole messages rather than one with
                the direction slotted into it: these languages do not all put
                the verb in the same place, and a token that is down must
                never be read out as a token that is up. Flat and unknown are
                two more whole messages for the same reason.

                Those two come from the markets namespace, where the phone's
                token card already ships them in all five locales, rather than
                asking translators for a second pair saying the same thing.
                The namespaces mark the bold clause with different tags,
                discovery with strong and markets with b, so each is handed
                the tag its own catalogue uses.

                None of the four recommends anything. The card reports a move
                and offers a way through to the desk; what to do about it is
                not ours to say. */}
            {tone === "unknown"
              ? tMarkets.rich("tokenMoveUnknown", { symbol: token.symbol, b: emphasis })
              : tone === "flat"
                ? tMarkets.rich("tokenMoveFlat", { symbol: token.symbol, b: emphasis })
                : t.rich(tone === "up" ? "tokenTipUp" : "tokenTipDown", {
                    symbol: token.symbol,
                    move: token.movePercent,
                    strong: emphasis,
                  })}
          </p>
        </div>

        <DiscoveryCta
          href={token.href}
          label={t("tokenCta", { symbol: token.symbol })}
          tone="dark"
          size={14}
          icon={
            <img src="/market/token-coins-icon.svg" alt="" aria-hidden className="size-[17.29px]" />
          }
          className="mt-[4.9px] ml-[18px] border-[2.47px] border-[#ffd52d]"
        />
      </div>
    </article>
  );
}

// One bar of the loading card.
//
// `components/ui/skeleton-line` is the shared one, but it is drawn in white for
// a dark surface. The chip and the tip here are white panels sitting on yellow,
// so their bars have to be dark to be seen at all.
function LoadingBar({ className }: { className: string }) {
  return <span aria-hidden className={`block animate-pulse rounded bg-black/10 ${className}`} />;
}

// The call before the route has a token to make it about.
//
// Same artwork, same geometry, same white chip and tip, with bars where the
// figures go. It stands in for the real card rather than replacing the shelf,
// so nothing moves when the data lands, and there is no symbol, no price and no
// percentage on screen in the meantime. There is no CTA either: a Buy pill
// needs a token to buy.
function TokenCallCardSkeleton() {
  return (
    <article aria-busy="true" className={`${CARD_BOX} ${TOKEN_CARD_BG}`}>
      <TokenCardArt />

      <div className="absolute top-[55.47px] left-[min(107.14px,22.23%)] flex w-fit max-w-[calc(100%_-_min(107.14px,22.23%)_-_14px)] rotate-[-3.07deg] items-center gap-[8.55px] rounded-[9.98px] bg-white p-[8.55px]">
        <span
          aria-hidden
          className="size-[34.22px] shrink-0 animate-pulse rounded-full bg-black/10"
        />
        <div className="flex flex-col gap-[5px]">
          <LoadingBar className="h-[9px] w-[48px]" />
          <LoadingBar className="h-[9px] w-[92px]" />
        </div>
        <span aria-hidden className="w-[25.67px] shrink-[999]" />
        <img
          src="/market/token-ticker-avatar.png"
          alt=""
          aria-hidden
          className="size-[22.81px] shrink-0"
        />
      </div>

      <div className="relative flex flex-col items-start pt-[110.09px] pr-6 pb-6 pl-[64px]">
        <div className="min-h-[76.1px] w-[262.59px] max-w-full">
          <div className="flex flex-col gap-[7px] rounded-[11.97px] bg-white pt-[8px] pr-[17.6px] pb-[9.6px] pl-[39px]">
            <LoadingBar className="h-[10px] w-full" />
            <LoadingBar className="h-[10px] w-[72%]" />
          </div>
        </div>
      </div>
    </article>
  );
}

// "Stay ahead of token moves on spot": the moves worth knowing about, one
// coin to a card.
//
// The cards ride a carousel, and each is a different coin. The row deals up to
// three from the featured coin on: the featured coin, the next and the one
// after, so a step through the carousel is a step through the ranking rather
// than the same call seen twice. Every ten seconds the featured coin advances
// and every card moves one place with it.
export function TokenMovesRow({
  tokens = [],
  loading = false,
}: {
  tokens?: readonly TokenSpot[];
  /** True while the route is still fetching the tokens. Draws the card empty. */
  loading?: boolean;
}) {
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

  const featured = useRotatingIndex(tokens.length, { intervalMs: TOKEN_HOLD_MS, paused });

  // Up to three coins, each once. Two coins deal two cards, one coin one.
  const dealt = tokens.slice(0, 3).map((_, offset) => tokens[(featured + offset) % tokens.length]);

  // Three states, and none of them invents a token.
  //
  // With coins the row is the cards. Waiting on the route it is two cards
  // drawn empty, so the shelf keeps its height and its place and no figure
  // appears before there is one. With the route settled and nothing to
  // feature there is no call to make, and the row goes rather than standing
  // over an empty carousel. The card that used to stand here was the design's
  // BTC comp, price and percentage included, and it was on screen every time
  // the route handed the row nothing.
  if (dealt.length === 0 && !loading) return null;

  const cards =
    dealt.length > 0
      ? dealt.map((token) => <TokenCallCard key={token.symbol} token={token} onHold={onHold} />)
      : [<TokenCallCardSkeleton key="first" />, <TokenCallCardSkeleton key="second" />];

  return (
    <DiscoveryRow title={t("tokenMovesTitle")} href="/spot">
      {cards.length > 1 ? (
        <Carousel label={t("tokenMovesCarousel")} trimPx={50}>
          {cards}
        </Carousel>
      ) : (
        // One slide, so it is given the whole frame rather than half of one
        // with a gutter where the next would have been. No peek either: there
        // is nothing behind it to show the edge of.
        <Carousel label={t("tokenMovesCarousel")} perView={1} peek={0}>
          {cards}
        </Carousel>
      )}
    </DiscoveryRow>
  );
}
