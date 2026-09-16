"use client";

import { Children, useCallback, useEffect, useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import useEmblaCarousel from "embla-carousel-react";

// Below this frame width the carousel shows one slide plus the peek instead of
// `perView`. Two slides and a peek on a phone leaves each one about a third of
// a narrow screen, which is not a card any more. Measured on the carousel's own
// frame rather than on the viewport, so a carousel inside a narrow column
// switches when that column gets narrow, not when the window does. 768 is the
// md breakpoint: the phone home renders below it at full width, and a wide
// phone in the 640 to 767 band was getting two cards too narrow for their
// copy.
const ONE_UP_BELOW = 768;

// The narrowest slide a trim is allowed to touch, in pixels.
//
// 481.94 is the artboard's own card, and it is also exactly where the Next 100X
// card stops being able to draw its artwork at full size: that card reserves
// 226.94px for the copy column and caps the art slot at 255px, and
// 226.94 + 255 = 481.94. So at or above this width the art slot is at its
// design size and a 50px trim costs the slide 10.4% of itself. Below it the
// copy column is already eating the picture, and every pixel the trim takes
// comes straight off the artwork: a 400px slide leaves 173px of art, and at the
// 768px viewport these rows first render at, the untrimmed slide is 328.30px
// and a trimmed one 278.30px, which leaves 51px and reads as a bug.
const TRIM_MIN_SLIDE_PX = 481.94;

// True when the element was focused by keyboard rather than by a click. Chrome,
// Safari and Firefox all support :focus-visible; jsdom does not implement it and
// throws on the selector, and in a test there is no viewport to scroll anyway.
function focusedByKeyboard(element: Element) {
  try {
    return element.matches(":focus-visible");
  } catch {
    return false;
  }
}

// The width one slide takes so that `slides` whole slides, their gaps and the
// peek add up to exactly the frame. Nothing is left over, so the row reaches
// both edges and has no bare gutter.
//
// `trimPx` narrows each slide without opening a gutter: the track is a flex row
// and the frame is a fixed width, so the space a trimmed slide gives up is taken
// by the next slide showing more of itself. The peek grows, the row still fills.
//
// This is the one piece of the old clone-and-transform engine kept whole: it is
// pure CSS arithmetic, independent of how the row is made to move, and Embla
// only needs a slide to have a definite flex-basis. The six call sites were each
// tuned against this exact formula, so reusing it rather than approximating it
// with a flat flex-basis percentage is what keeps every one of them pixel-exact.
function slideWidthFor(slides: number, gapPx: number, peek: number, trimPx: number) {
  const share = `(100% - ${slides * gapPx}px) / ${slides + peek}`;
  return trimPx ? `calc(${share} - ${trimPx}px)` : `calc(${share})`;
}

// The frame width at which an untrimmed slide is exactly TRIM_MIN_SLIDE_PX.
// It is `slideWidthFor` solved for the frame: a slide of `s` needs a frame of
// s * (slides + peek) + slides * gap. Below this the trim is switched off.
function trimFloorFrame(slides: number, gapPx: number, peek: number) {
  return TRIM_MIN_SLIDE_PX * (slides + peek) + slides * gapPx;
}

interface CarouselProps {
  /** Each child is one slide. */
  children: React.ReactNode;
  /** Accessible name for the carousel region. Required. */
  label: string;
  /** Milliseconds between automatic advances. Default 10000. Pass 0 to disable autoplay. */
  intervalMs?: number;
  /** Slides fully visible at once, before the peek. Default 2. */
  perView?: number;
  /** Fraction of one slide's width left visible as the next slide's peek. Default 0.12. */
  peek?: number;
  /** Gap between slides, in pixels. Default 12. */
  gapPx?: number;
  /**
   * Pixels shaved off each fully-visible slide. The space becomes more peek, so
   * the row still fills its frame and no gutter opens. Applied only while an
   * untrimmed slide would be at least `TRIM_MIN_SLIDE_PX` wide, and never at the
   * one-up layout: a fixed trim is a much larger share of a smaller card, and on
   * a card that small it comes out of the artwork. Default 0.
   */
  trimPx?: number;
  /** Extra classes for the outer region. */
  className?: string;
}

// A looping, swipeable carousel built on Embla: it shows `perView` slides plus
// a sliver of the next one, drags and swipes on touch and pointer alike, and
// carries a bottom row of dots that track the slide in view and jump to one on
// tap. There are no floating arrow buttons; a row this narrow next to a thumb
// or a cursor is driven by dragging the cards themselves, the same way
// `promo-deck.tsx` and the other Embla rows in this app already work.
//
// Embla has no built-in autoplay, so a plain interval calls `scrollNext` on the
// cadence `intervalMs` asks for, paused while the pointer or focus is on the
// carousel and switched off entirely under reduced motion. `loop: true` is
// Embla's own wraparound, which replaces the clone-and-jump engine this
// component used to hand-roll: the same effect, for a fraction of the code.
//
// Each child is wrapped in a slide sized by `slideWidthFor`, the same
// container-query arithmetic the old engine used, now driving a slide's
// flex-basis instead of its width. That keeps every one of the six existing
// callers pixel-exact without touching a single call site.
//
// It knows nothing about what is on a slide. Callers pass children.
export function Carousel({
  children,
  label,
  intervalMs = 10000,
  perView = 2,
  peek = 0.12,
  gapPx = 12,
  trimPx = 0,
  className = "",
}: CarouselProps) {
  const t = useTranslations("carousel");
  const slides = Children.toArray(children);
  const count = slides.length;
  const loop = count > 1;

  const [emblaRef, emblaApi] = useEmblaCarousel({ align: "start", dragFree: false, loop });
  const [selected, setSelected] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const trackId = useId();

  // Embla's own ref callback, merged with a plain ref so the keyboard handler
  // below can still reach the viewport node directly.
  const setViewport = useCallback(
    (node: HTMLDivElement | null) => {
      viewportRef.current = node;
      emblaRef(node);
    },
    [emblaRef]
  );

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReducedMotion(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (!emblaApi) return;
    const onSelect = () => setSelected(emblaApi.selectedScrollSnap());
    emblaApi.on("select", onSelect);
    emblaApi.on("reInit", onSelect);
    return () => {
      emblaApi.off("select", onSelect);
      emblaApi.off("reInit", onSelect);
    };
  }, [emblaApi]);

  // Autoplay. Off with nothing to loop through, off with intervalMs at 0, off
  // while the pointer or focus rests on the carousel, off under reduced
  // motion: the same four gates the hand-built engine used to check before it
  // moved.
  useEffect(() => {
    if (!emblaApi || !loop || !intervalMs || paused || reducedMotion) return;
    const timer = window.setInterval(() => emblaApi.scrollNext(), intervalMs);
    return () => window.clearInterval(timer);
  }, [emblaApi, intervalMs, loop, paused, reducedMotion]);

  // The slide width has to change with the frame, and a width that changes with
  // the frame cannot be an inline style. It goes in a rule of its own, keyed to
  // this carousel's track, and the flex-basis below reads the property rather
  // than repeating the arithmetic.
  const trackSelector = `[data-ws-carousel="${trackId}"]`;
  // Untrimmed is the base width, and the trim is layered on top of it only where
  // the slide is wide enough to spare the pixels. A fixed trim is a bigger share
  // of a smaller card: 50px is 10.4% of the artboard's 481.94px card, 12.5% of a
  // 400px one and 15.2% of the 328.30px slide a 768px viewport gives. Below
  // TRIM_MIN_SLIDE_PX it also stops coming out of slack and starts coming out of
  // the artwork, so the gate is set there and read off the carousel's own frame,
  // which is what the slide width derives from.
  const widthRule = `${trackSelector}{--ws-carousel-slide:${slideWidthFor(perView, gapPx, peek, 0)}}`;
  const trimRule = trimPx
    ? `@container ws-carousel (width >= ${trimFloorFrame(perView, gapPx, peek).toFixed(2)}px){${trackSelector}{--ws-carousel-slide:${slideWidthFor(perView, gapPx, peek, trimPx)}}}`
    : "";
  // The one-up layout is a different slide off a different formula, so it sets
  // its own width and never inherits a trim. It comes after the trim rule and
  // wins any overlap, though on the two-up default there is none to win: the
  // trim starts above a 1000px frame and this ends at 640px.
  const oneUpRule =
    perView > 1
      ? `@container ws-carousel (width < ${ONE_UP_BELOW}px){${trackSelector}{--ws-carousel-slide:${slideWidthFor(1, gapPx, peek, 0)}}}`
      : "";

  return (
    <section
      aria-roledescription="carousel"
      aria-label={label}
      className={`flex flex-col ${className}`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <style>{widthRule + trimRule + oneUpRule}</style>
      {/* The frame. It is the measuring box and nothing else: it holds the
          container query, and it does not clip. The clip belongs one level
          down, on the viewport, which is also the node Embla drives.
          `container-type: inline-size` contains layout, style and inline size,
          so every container query below reads exactly the width the viewport
          fills. Named, so the one-up rule cannot be answered by some other
          container the page happens to have declared further up the tree. */}
      <div
        className="relative"
        style={{ containerType: "inline-size", containerName: "ws-carousel" }}
      >
        <div
          ref={setViewport}
          className="overflow-hidden"
          // `overflow-hidden` can still scroll when a child off to the right
          // takes focus, which would fight the transform Embla drives on the
          // track underneath it. Embla never reads scrollLeft itself, so
          // resetting it here is a no-op for the carousel and a safety net
          // against that browser behaviour, same as before.
          onFocusCapture={(event) => {
            const viewport = viewportRef.current;
            if (viewport) viewport.scrollLeft = 0;
            if (!emblaApi) return;
            const target = event.target as HTMLElement;
            // Only for keyboard focus: a click on the peeked slide should not
            // shuffle the row out from under the pointer.
            if (!focusedByKeyboard(target)) return;
            const slide = target.closest<HTMLElement>("[data-carousel-slide]");
            const index = Number(slide?.dataset.carouselSlide);
            if (slide && !Number.isNaN(index)) emblaApi.scrollTo(index);
          }}
        >
          <div
            data-ws-carousel={trackId}
            // Off while the carousel advances on its own, so a screen reader is
            // not interrupted by slides nobody asked for. Once it is paused, or
            // if it never rotates, a move is something the reader asked for.
            aria-live={paused || !intervalMs ? "polite" : "off"}
            className="flex touch-pan-y"
            // Spacing is a negative margin here plus a left padding on each
            // slide, NOT a CSS `gap`. Embla measures slides with
            // getBoundingClientRect, which does not see a flex `gap`, so with
            // `loop: true` the wraparound offset came up short by exactly one
            // gap and the last slide sat flush against the first coming round
            // behind it. Padding is inside the slide's own box (border-box is
            // global via Tailwind's preflight), so it is measured, and the
            // negative margin cancels the leading slide's padding so the row
            // still starts flush at the frame's left edge. This is Embla's own
            // documented spacing technique, and it leaves `slideWidthFor` and
            // every call site untouched.
            style={{ marginLeft: -gapPx }}
          >
            {slides.map((slide, index) => (
              <div
                key={index}
                role="group"
                aria-roledescription="slide"
                data-carousel-slide={index}
                // `min-w-0` matters here: with flex-grow and flex-shrink both
                // zero, a slide's content would otherwise be free to blow the
                // box out past its flex-basis, the classic flex min-width:auto
                // trap. `balance-carousel.tsx` and `prediction-slider.tsx`
                // carry the same class for the same reason.
                className="min-w-0"
                style={{ flex: "0 0 var(--ws-carousel-slide)", paddingLeft: gapPx }}
              >
                {slide}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* The comp's indicator: a long bar for the slide in view, a short one
          for the rest, tap to jump. Hidden with nothing to page through. Each
          dot's visible bar stays small, matching `promo-deck.tsx`'s own dots,
          with a 44x44 invisible hit area centred on it via an absolutely
          positioned ::after, the same technique `meme-market-metrics.tsx` uses
          for a trigger in a row too tight for a 44px box to sit in the flow. */}
      {count > 1 ? (
        <div className="mt-3 flex justify-center gap-[3px]">
          {slides.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => emblaApi?.scrollTo(i)}
              aria-label={t("goToSlide", { index: i + 1 })}
              className={`relative h-1 cursor-pointer rounded-full transition-all after:absolute after:top-1/2 after:left-1/2 after:h-11 after:w-11 after:-translate-x-1/2 after:-translate-y-1/2 after:content-[''] ${
                i === selected ? "w-9 bg-white" : "w-3.5 bg-white/45"
              }`}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}
