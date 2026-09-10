"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Artboard } from "@/components/ui/artboard";
import { useMoney } from "@/components/ui/currency-select";
import { usePredictions } from "@/features/prediction/hooks/use-predictions";
import { formatCountdown, parseCloseTime, useCountdown } from "@/hooks/use-countdown";
import { useRotatingIndex } from "@/hooks/use-rotating-index";
import type { Prediction } from "@/lib/types";

// One market every ten seconds, the cadence the discovery surfaces share.
const ROTATE_MS = 10_000;

/**
 * Whether the reader asked their system to cut animation.
 *
 * Read through an effect rather than during render so the server and the first
 * client paint agree. `matchMedia` is missing in jsdom, so its absence is
 * treated as "no preference stated", which is what a browser without the query
 * reports anyway.
 */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  return reduced;
}

/**
 * The card's yellow treatment, and nothing else.
 *
 * The gradient is the design's own (#FEE685 to #FFD425) and the rays and clouds
 * are the artwork-only exports beside it. Every word on the card is DOM drawn on
 * top of this, so a market question, a price, or a volume never lives in an
 * asset.
 */
function BannerFrame({ children }: { children: ReactNode }) {
  return (
    // The comp's 330x213 artboard, scaled as one piece to the slide it gets,
    // so the type and the pill grow with the card on a wide phone instead of
    // sitting small in a bigger box.
    <Artboard width={330} height={213} className="rounded-[15px]">
      <div className="relative h-full w-full bg-gradient-to-b from-[#FEE685] to-[#FFD425]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/prediction/sunburst-yellow.svg"
          alt=""
          aria-hidden
          className="pointer-events-none absolute inset-0 h-full w-full object-cover"
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/prediction/cloud-large.svg"
          alt=""
          aria-hidden
          className="pointer-events-none absolute top-[31%] left-[46%] w-[24%] opacity-80"
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/prediction/cloud-small.svg"
          alt=""
          aria-hidden
          className="pointer-events-none absolute top-[19%] left-[29%] w-[13%] opacity-70"
        />
        {children}
      </div>
    </Artboard>
  );
}

interface PauseControlProps {
  paused: boolean;
  onToggle: () => void;
}

/**
 * The stop control WCAG 2.2.2 requires of content that starts moving on its own
 * and runs past five seconds. Hover and focus hold the rotation too, but neither
 * is available to a touch reader, so the button is the mechanism that always is.
 */
function PauseControl({ paused, onToggle }: PauseControlProps) {
  const t = useTranslations("prediction");

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={paused}
      aria-label={paused ? t("mobileResumeRotation") : t("mobilePauseRotation")}
      // The drawn control is the design's 24px dot. The button around it is the
      // 44px target the guidelines ask for, pulled back out of the layout with a
      // negative margin so honouring the target does not push the chip row open.
      className="ws-pressable relative z-[1] -m-2.5 grid size-11 shrink-0 cursor-pointer place-items-center"
    >
      <span className="grid size-6 place-items-center rounded-full bg-black/10 text-[#0B0A0A] hover:bg-black/20">
        <svg viewBox="0 0 12 12" aria-hidden className="size-3" fill="currentColor">
          {paused ? <path d="M3 1.5l7 4.5-7 4.5z" /> : <path d="M3 2h2.2v8H3zm3.8 0H9v8H6.8z" />}
        </svg>
      </span>
    </button>
  );
}

interface PredictionBannerProps {
  prediction: Prediction;
  /**
   * The market's volume, already formatted in the reader's own currency, or
   * null when the feed states none. Formatted by the caller rather than here:
   * money belongs to the money layer, and a card that converts its own figures
   * is a card that can disagree with the rest of the app.
   */
  volume: string | null;
  paused: boolean;
  onTogglePause: () => void;
  /** Hidden when there is only one market, since nothing is rotating. */
  showPauseControl: boolean;
}

/**
 * The chip in the top-left corner of the card.
 *
 * The design draws a live countdown there. A market only has one when the feed
 * gave it a close date, so a market without one falls back to its category
 * rather than to an invented clock. Both are the market's own data; neither is
 * a placeholder.
 */
function BannerChip({ prediction: p }: { prediction: Prediction }) {
  const t = useTranslations("prediction");
  const remaining = useCountdown(parseCloseTime(p.endsAt));
  const countdown = formatCountdown(remaining);
  const closed = remaining !== null && remaining <= 0;

  const chip =
    "inline-flex max-w-[70%] items-center gap-1 rounded-full border border-black/30 px-2 py-[3px] text-[9px] font-semibold tracking-[0.62px] text-[#0B0A0A] uppercase";

  if (countdown === null) {
    return (
      <span className={chip}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/market/prediction-coins-black.svg" alt="" aria-hidden className="size-3" />
        <span className="truncate">{p.tag}</span>
      </span>
    );
  }

  return (
    <span className={chip}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/prediction/stopwatch-icon.svg" alt="" aria-hidden className="size-3" />
      {closed ? (
        <span className="truncate">{t("marketClosedLabel")}</span>
      ) : (
        <>
          {/* Bare digits read as nonsense out loud, so the clock says what it
              is counting to. It is not a live region: a value that changes
              every second would interrupt a screen reader continuously. */}
          <span className="sr-only">{t("closesIn")}</span>
          <span className="tnum">{countdown}</span>
        </>
      )}
    </span>
  );
}

/**
 * One market, drawn as the design's yellow banner.
 *
 * Everything the reader sees comes from the market being shown: the category,
 * the question, the Yes price, the volume, and the artwork. The prices arrive
 * from the feed already formatted for display, and nothing here does arithmetic
 * on them.
 */
function PredictionBanner({
  prediction: p,
  volume,
  paused,
  onTogglePause,
  showPauseControl,
}: PredictionBannerProps) {
  const t = useTranslations("prediction");
  const [artworkFailed, setArtworkFailed] = useState(false);
  // A Polymarket card has no page of its own on this build; the banner opens
  // the prediction desk, where the same market can be bet on.
  const href = "/prediction";

  return (
    <BannerFrame>
      <div className="relative flex h-full flex-col">
        <div className="flex min-h-0 flex-1 items-stretch gap-2 px-[6%] pt-[6%] pb-[2%]">
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex items-center gap-2">
              <BannerChip prediction={p} />
              {showPauseControl ? <PauseControl paused={paused} onToggle={onTogglePause} /> : null}
            </div>

            {/* The question is the link text, so a screen reader hears which
                market this opens rather than "card". The stretched pseudo-element
                hands the rest of the banner to the same link, and the controls
                below sit above it with their own clicks. */}
            <h3 className="ws-chewy mt-[5%] text-[15px] leading-[1.22] text-[#252525]">
              <Link
                href={href}
                // The global click ripple turns whatever was pressed into a
                // positioning context so it can hang its own layer inside. On
                // this link that is fatal: the press would make the link the
                // containing block for the pseudo-element below, the stretched
                // area would collapse to the width of the text, and the release
                // would land on nothing. This is the ripple's own opt-out.
                data-no-ripple
                className="block rounded-sm outline-none after:absolute after:inset-0 after:content-[''] focus-visible:ring-2 focus-visible:ring-[#0B0A0A]"
              >
                {/* The clamp is on this span and not on the link or the heading
                    above it. `line-clamp` is `overflow: hidden`, and any clip
                    between the link and the box it stretches to cuts the
                    stretched pseudo-element back to the width of the text,
                    which leaves most of the card dead to a tap. */}
                <span className="line-clamp-3">{p.q}</span>
              </Link>
            </h3>

            {/* The design fills this line with a worked example of trading
                advice. It is sample copy, not anything the feed sends, so the
                line carries what the market actually reports instead: where the
                Yes side stands, and how much has traded. */}
            <p className="tnum mt-auto flex items-center gap-3 text-[10px] font-semibold text-[#0B0A0A]">
              <span className="flex items-center gap-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/prediction/icon-trades.svg" alt="" aria-hidden className="size-[11px]" />
                {p.yes} {t("yesLabel")}
              </span>
              {volume ? (
                <span className="flex items-center gap-1">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/prediction/icon-volume.svg"
                    alt=""
                    aria-hidden
                    className="size-[11px]"
                  />
                  {volume}
                </span>
              ) : null}
            </p>
          </div>

          {/* The market's own artwork. The design tilts two photos here; the
              feed carries one image per market, so one is what is drawn rather
              than another market's picture beside it. It is served from a
              provider-controlled host, so it renders through a plain img:
              next/image would reject a host that is not in the allowlist. */}
          <div className="relative w-[21%] shrink-0 rotate-[5deg] self-start overflow-hidden rounded-[10px] border-2 border-white/70 bg-black/10 shadow-[0_4px_10px_rgba(0,0,0,0.15)]">
            <div className="aspect-square w-full">
              {p.image && !artworkFailed ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={p.image}
                  alt=""
                  loading="lazy"
                  onError={() => setArtworkFailed(true)}
                  className="h-full w-full object-cover"
                />
              ) : (
                // No artwork on this market, so the frame keeps the design's
                // shape with a decorative mark instead of another market's photo.
                <div className="grid h-full w-full place-items-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/market/prediction-coins-black.svg"
                    alt=""
                    aria-hidden
                    className="w-1/2 opacity-50"
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* The action band: the design's lighter strip across the foot of the
            card. Raised above the stretched question link so each action keeps
            its own destination, and each is a 44px target wrapped around the
            smaller pill the design draws. */}
        <div className="relative z-[1] flex h-[34%] shrink-0 items-center gap-[3.6%] bg-gradient-to-b from-[#FEECA6] to-[#FFF5CD] px-[6%]">
          {/* One action, into the market on show. The desk itself is where the
              section's heading goes. */}
          <Link
            href={href}
            className="ws-pressable flex min-h-11 shrink-0 items-center justify-center"
          >
            <span className="flex h-[34px] w-full items-center justify-center gap-1.5 rounded-full bg-white px-4 text-[11px] font-semibold whitespace-nowrap text-[#0B0A0A] shadow-[0_1px_3px_rgba(0,0,0,0.12)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/market/prediction-coins-black.svg"
                alt=""
                aria-hidden
                className="size-3.5 shrink-0"
              />
              <span className="truncate">{t("mobilePredictNow")}</span>
            </span>
          </Link>
        </div>
      </div>
    </BannerFrame>
  );
}

/** The banner's shape while the markets are still in flight. */
function BannerSkeleton() {
  const t = useTranslations("prediction");

  return (
    <BannerFrame>
      <div className="flex h-full flex-col gap-3 p-[5%]" role="status" aria-live="polite">
        <span className="sr-only">{t("loading")}</span>
        <div className="h-4 w-20 animate-pulse rounded-full bg-black/10" />
        <div className="h-3 w-4/5 animate-pulse rounded-full bg-black/10" />
        <div className="h-3 w-3/5 animate-pulse rounded-full bg-black/10" />
        <div className="mt-auto h-6 w-28 animate-pulse rounded-full bg-black/10" />
      </div>
    </BannerFrame>
  );
}

interface BannerMessageProps {
  message: string;
  action?: ReactNode;
}

/** The banner with no market to show: an error, or an empty feed. */
function BannerMessage({ message, action }: BannerMessageProps) {
  return (
    <BannerFrame>
      <div className="relative flex h-full flex-col items-center justify-center gap-3 p-[8%] text-center">
        <p className="text-[12px] font-semibold text-[#0B0A0A]">{message}</p>
        {action}
      </div>
    </BannerFrame>
  );
}

export function PredictionMobile() {
  const t = useTranslations("prediction");
  const money = useMoney();
  const { data, isPending, isError, refetch } = usePredictions();
  const markets = data ?? [];

  // Two separate holds, because they answer to different people. `pausedByUser`
  // is the explicit button and stays where the reader put it. `held` is hover,
  // focus, and touch, and releases itself. Reduced motion stops the rotation
  // outright.
  const [pausedByUser, setPausedByUser] = useState(false);
  const [held, setHeld] = useState(false);
  const reducedMotion = usePrefersReducedMotion();

  const index = useRotatingIndex(markets.length, {
    intervalMs: ROTATE_MS,
    paused: pausedByUser || held || reducedMotion,
  });
  const current = markets[index];

  return (
    <div className="w-full p-4">
      <Link href="/prediction" className="inline-flex items-end gap-[3px]">
        <span className="ws-display text-[18px] leading-[1.2] tracking-[-0.36px] text-white">
          {t("mobileHeading")} <span className="text-[#FFD62F]">{t("mobileHeadingAccent")}</span>{" "}
          {t("mobileHeadingSuffix")}
        </span>
        <svg viewBox="0 0 20 20" aria-hidden className="mb-[1px] h-5 w-5 shrink-0" fill="none">
          <path
            d="M7.5 4l6 6-6 6"
            stroke="white"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </Link>

      {/* A swipe carousel of distinct prediction cards, as the Market design
          draws it: the rotating live market, then the illustrated promo card.
          Each slide is just under full width so the next one peeks, signalling
          there is more to swipe to. Native scroll-snap, so each card renders
          once (no carousel clones). */}
      <div className="mt-3 flex snap-x snap-mandatory [scrollbar-width:none] gap-2.5 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden">
        {/* Hover, focus, and a finger on the card all hold the rotation. Without
            that, a market can swap under a pointer already on its way down and
            open a market the reader never chose. */}
        <div
          className="w-[88%] shrink-0 snap-start"
          onPointerEnter={() => setHeld(true)}
          onPointerLeave={() => setHeld(false)}
          onPointerDown={() => setHeld(true)}
          onFocusCapture={() => setHeld(true)}
          onBlurCapture={() => setHeld(false)}
        >
          {isError ? (
            <BannerMessage
              message={t("mobileMarketsError")}
              action={
                <button
                  type="button"
                  onClick={() => void refetch()}
                  className="ws-pressable cursor-pointer rounded-full bg-[#0B0A0A] px-3 py-[6px] text-[10px] font-semibold text-[#FFD425]"
                >
                  {t("refresh")}
                </button>
              }
            />
          ) : isPending ? (
            <BannerSkeleton />
          ) : current ? (
            <PredictionBanner
              // Remounting per market resets the artwork's error state, so one
              // market's broken image does not blank the next market's frame.
              key={current.q}
              prediction={current}
              // Converted once, here, through the app's money layer, so the
              // figure agrees with every other amount on the phone and the card
              // itself never touches an exchange rate. A market the feed gave no
              // volume for shows none rather than a zero.
              volume={current.volumeUsd != null ? money.format(current.volumeUsd) : null}
              paused={pausedByUser}
              onTogglePause={() => setPausedByUser((was) => !was)}
              showPauseControl={markets.length > 1 && !reducedMotion}
            />
          ) : (
            <BannerMessage
              message={t("mobileNoMarkets")}
              action={
                <Link
                  href="/prediction"
                  className="ws-pressable rounded-full bg-[#0B0A0A] px-3 py-[6px] text-[10px] font-semibold text-[#FFD425]"
                >
                  {t("exploreAllMarkets")}
                </Link>
              }
            />
          )}
        </div>

        {/* The boxing card is a wider export than the market banner, so it sits
            in the same aspect box and fills it: the slides stay one height and
            the carousel does not jump as it swipes. */}
        <Link
          href="/prediction"
          aria-label={t("beltCardAria")}
          className="ws-pressable aspect-[330/213] w-[88%] shrink-0 snap-start overflow-hidden rounded-[15px]"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/prediction/boxing-card.png" alt="" className="h-full w-full object-cover" />
        </Link>
      </div>
    </div>
  );
}
