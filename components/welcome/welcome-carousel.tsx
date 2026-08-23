"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Wordmark } from "@/components/ui/wordmark";

// The three welcome slides, in the order the design runs them. Each image is a
// file in public/, exported from the design file at 2x.
const SLIDES = [
  { key: "slide1", image: "/carousel_one.png" },
  { key: "slide2", image: "/carousel_two.png" },
  { key: "slide3", image: "/carousel_three.png" },
] as const;

// The first thing a new visitor meets: what the app is, how signing in works,
// and what the assistant does. Scroll-snapped rather than a timed carousel, so
// the slide only ever moves when the reader moves it.
export function WelcomeCarousel() {
  const t = useTranslations("welcome");
  const trackRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);

  // The active dot follows the track's real scroll position, so a swipe, a dot
  // press and a keyboard scroll all agree on which slide is showing.
  const onScroll = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    const next = Math.round(track.scrollLeft / track.clientWidth);
    setIndex((current) => (current === next ? current : next));
  }, []);

  // Jumps rather than glides. A smooth scroll on a mandatory-snap track is
  // cancelled part-way through as the snap positions recalculate, which left
  // the pager stuck a few pixels in whichever API drove it. Swiping, which is
  // how the slides are actually moved, still animates natively.
  const goTo = (slide: number) => {
    const track = trackRef.current;
    if (!track) return;
    track.scrollLeft = slide * track.clientWidth;
    // Set the dot here rather than waiting for the scroll event: a programmatic
    // scroll does not reliably fire one, which left the pager a step behind the
    // slide it had just moved to. A swipe still updates it through onScroll.
    setIndex(slide);
  };

  return (
    // The design is a phone screen and has no wide layout, so the column keeps
    // its phone width and centres on anything larger rather than stretching.
    <div className="flex min-h-dvh justify-center bg-black">
      <div className="relative flex w-full max-w-[430px] flex-col">
        {/* The rays behind the artwork, as the design has them: a faint fan from
          behind the logo that fades out before it reaches the copy. */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-[74dvh]"
          style={{
            background:
              "repeating-conic-gradient(from 0deg at 50% 0%, rgba(255,255,255,0.16) 0deg 2.6deg, transparent 2.6deg 8deg)",
            maskImage: "radial-gradient(135% 100% at 50% 0%, #000 8%, transparent 82%)",
            WebkitMaskImage: "radial-gradient(135% 100% at 50% 0%, #000 8%, transparent 82%)",
          }}
        />

        <header className="relative flex justify-center px-6 pt-6">
          <Wordmark />
        </header>

        <div
          ref={trackRef}
          onScroll={onScroll}
          aria-label={t("slides")}
          className="relative flex flex-1 snap-x snap-mandatory [scrollbar-width:none] overflow-x-auto [&::-webkit-scrollbar]:hidden"
        >
          {SLIDES.map((slide) => (
            <section
              key={slide.key}
              className="flex w-full shrink-0 snap-center flex-col items-center px-7 pt-7"
            >
              {/* The artwork sits on the glass card the design puts behind it. */}
              {/* <div className="ws-glass grid aspect-square w-full max-w-[300px] place-items-center rounded-[28px] p-5"> */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={slide.image} alt="" className="w-full object-contain" draggable={false} />
              {/* </div> */}

              <h1 className="ws-display mt-9 text-center text-[26px] leading-[1.15] tracking-[-0.02em] text-balance">
                {t(`${slide.key}Title`)}
              </h1>
              <p className="mt-3 max-w-[34ch] text-center text-[14.5px] leading-[1.5] font-normal text-white/65">
                {t(`${slide.key}Body`)}
              </p>
            </section>
          ))}
        </div>

        <div className="relative flex justify-center gap-2 pt-2">
          {SLIDES.map((slide, i) => (
            <button
              key={slide.key}
              type="button"
              onClick={() => goTo(i)}
              aria-label={t("goToSlide", { index: i + 1 })}
              aria-current={i === index}
              className={`h-1.5 cursor-pointer rounded-full transition-all ${
                i === index ? "w-6 bg-white/80" : "w-1.5 bg-white/22"
              }`}
            />
          ))}
        </div>

        <div className="relative flex flex-col gap-3 px-7 pt-7 pb-[max(28px,env(safe-area-inset-bottom))]">
          <Link
            href="/auth"
            className="ws-chrome text-ink flex w-full items-center justify-center rounded-full bg-white px-4 py-4 font-sans text-[15px] font-semibold"
          >
            {t("continueEmail")}
          </Link>
          <Link
            href="/auth"
            className="flex w-full items-center justify-center rounded-full border border-white/14 bg-white/6 px-4 py-4 font-sans text-[15px] font-medium text-white transition-colors hover:bg-white/12"
          >
            {t("haveAccount")}
          </Link>
        </div>
      </div>
    </div>
  );
}
