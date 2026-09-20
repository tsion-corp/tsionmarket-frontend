"use client";

import {
  Children,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
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

// The accumulated horizontal wheel delta, in pixels, that moves the carousel by
// one slide, and the quiet period after a step.
//
// A trackpad flick arrives as dozens of small deltas as the momentum decays, so
// a threshold on its own would run the whole rail off one gesture. The
// threshold decides how far a reader has to push, the cooldown decides that one
// flick is one slide. Both are here, in one place, because they are the part of
// this that can only really be judged on hardware.
export const WHEEL_STEP_PX = 40;
export const WHEEL_COOLDOWN_MS = 320;

// How long the automatic advance stays off after a drag, a wheel step or a dot
// tap, so a rail that keeps moving does not pull itself out from under someone
// who has just reached for it.
export const INTERACTION_PAUSE_MS = 8000;

// One line of wheel delta in pixels, for the browsers that report `deltaMode`
// in lines rather than pixels. Firefox on Windows is the common one. 16 is this
// app's root font size, so a line is one line of body text.
const WHEEL_LINE_PX = 16;

// Where a reader's choice to stop the banners lives for the session. One key
// for every carousel: stopping the banners means the banners, not this
// particular instance of them.
const PAUSE_STORAGE_KEY = "ws.carousel.paused";

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

// Reading and writing the session's pause choice. A browser can refuse storage
// outright, in a private window or behind a cookie policy, and the accessor
// throws rather than returning null: these two catches are that capability
// check, not a swallowed failure. Without storage the rail simply plays, and a
// choice made on the page still holds until it is unmounted.
function readStoredPause(): boolean {
  try {
    return window.sessionStorage.getItem(PAUSE_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function writeStoredPause(paused: boolean) {
  try {
    window.sessionStorage.setItem(PAUSE_STORAGE_KEY, String(paused));
  } catch {
    // Nothing to do: the choice is still held in the store below for this page.
  }
}

// The pause choice as one store rather than one piece of state per carousel,
// the same shape `features/trade/components/spot-mode.tsx` uses for the spot
// mode. The stored key is global, so stopping the banners on one rail stops
// them everywhere, and a subscription is what keeps two rails on a page from
// disagreeing.
const pauseListeners = new Set<() => void>();
let bannersPaused = false;

function subscribeToPause(notify: () => void) {
  pauseListeners.add(notify);
  return () => {
    pauseListeners.delete(notify);
  };
}

function setBannersPaused(paused: boolean) {
  bannersPaused = paused;
  writeStoredPause(paused);
  for (const notify of pauseListeners) notify();
}

// A wheel delta in pixels. Most events are already pixels (`deltaMode` 0), some
// browsers report lines, and a few report pages.
function wheelPixels(delta: number, deltaMode: number, viewport: HTMLElement) {
  if (deltaMode === 1) return delta * WHEEL_LINE_PX;
  // A page is one carousel viewport wide. A node that has not been measured,
  // which is what jsdom and a hidden rail both give, falls back to the window
  // so that a page is never worth nothing.
  if (deltaMode === 2) return delta * (viewport.clientWidth || window.innerWidth);
  return delta;
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
  /**
   * "hover" (the default) pauses the advance while the pointer rests on the
   * carousel, which is how every carousel in the app behaved before this prop
   * existed. "persist" keeps advancing under a resting pointer and pauses only
   * on the gates a reader cannot argue with: the pause control, focus inside,
   * a hidden tab, a carousel off screen, and the seconds after an interaction.
   */
  autoAdvance?: "hover" | "persist";
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
// carousel (or, under `autoAdvance="persist"`, on the narrower set of gates
// below) and switched off entirely under reduced motion. `loop: true` is
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
  autoAdvance = "hover",
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

  // The `autoAdvance="persist"` gates. Each starts in the state that lets the
  // carousel play, so the server frame and the first client frame agree and
  // nothing is held back before the browser has answered. The stored pause
  // choice is reconciled after mount, below, for the same reason.
  const controlPaused = useSyncExternalStore(
    subscribeToPause,
    () => bannersPaused,
    () => false
  );
  const [focusWithin, setFocusWithin] = useState(false);
  const [tabHidden, setTabHidden] = useState(false);
  const [offScreen, setOffScreen] = useState(false);
  const [interactions, setInteractions] = useState(0);

  const sectionRef = useRef<HTMLElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const trackId = useId();

  // A counter rather than a timestamp, so two interactions inside one
  // millisecond still restart the pause below.
  //
  // Only "persist" reads it: under "hover" the pointer resting on the carousel
  // is already the pause, and there is nothing to record.
  const noteInteraction = useCallback(() => {
    if (autoAdvance !== "persist") return;
    setInteractions((count) => count + 1);
  }, [autoAdvance]);

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

  // A drag counts as an interaction, the same as a wheel step or a dot tap.
  useEffect(() => {
    if (!emblaApi) return;
    emblaApi.on("pointerDown", noteInteraction);
    return () => {
      emblaApi.off("pointerDown", noteInteraction);
    };
  }, [emblaApi, noteInteraction]);

  // The interaction pause runs out on its own. Every fresh interaction changes
  // the count, which restarts this timer rather than letting the first one
  // expire early.
  useEffect(() => {
    if (!interactions) return;
    const timer = window.setTimeout(() => setInteractions(0), INTERACTION_PAUSE_MS);
    return () => window.clearTimeout(timer);
  }, [interactions]);

  // The stored pause choice is read after mount, never during render: the
  // server has no session storage, so reading it during render would make the
  // first client frame disagree with the markup it is hydrating.
  useEffect(() => {
    if (autoAdvance !== "persist") return;
    const stored = readStoredPause();
    if (stored !== bannersPaused) setBannersPaused(stored);
  }, [autoAdvance]);

  // The rest of the "persist" gates, all of them about whether a reader is in a
  // position to see the carousel move. None of this is wired up under "hover",
  // where a resting pointer already covers most of it.
  useEffect(() => {
    if (autoAdvance !== "persist") return;
    const section = sectionRef.current;
    if (!section) return;

    const onFocusIn = () => setFocusWithin(true);
    const onFocusOut = (event: FocusEvent) => {
      // focusout also fires when focus moves from one slide to the next, which
      // is still focus inside the carousel.
      const next = event.relatedTarget;
      if (next instanceof Node && section.contains(next)) return;
      setFocusWithin(false);
    };
    const onVisibility = () => setTabHidden(document.visibilityState === "hidden");
    const observer = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (entry) setOffScreen(!entry.isIntersecting);
    });

    section.addEventListener("focusin", onFocusIn);
    section.addEventListener("focusout", onFocusOut);
    document.addEventListener("visibilitychange", onVisibility);
    observer.observe(section);
    onVisibility();

    return () => {
      section.removeEventListener("focusin", onFocusIn);
      section.removeEventListener("focusout", onFocusOut);
      document.removeEventListener("visibilitychange", onVisibility);
      observer.disconnect();
    };
  }, [autoAdvance]);

  // Wheel and trackpad. Embla binds pointer and touch drag only, and the
  // viewport is overflow-hidden over a transform-driven track, so without this
  // there is nothing for a trackpad to move: the rail can only be pressed and
  // dragged. Registered here rather than as React's `onWheel` because React's
  // wheel listener is passive and so cannot preventDefault.
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || !emblaApi) return;

    let accumulated = 0;
    let cooldownUntil = 0;

    const onWheel = (event: WheelEvent) => {
      // Horizontal intent only: a two-finger trackpad swipe, or the mouse
      // convention of shift plus a wheel. Everything else is the page's, and
      // is left alone with nothing prevented.
      const horizontal =
        Math.abs(event.deltaX) > Math.abs(event.deltaY)
          ? event.deltaX
          : event.shiftKey
            ? event.deltaY
            : 0;
      if (!horizontal) return;

      const delta = wheelPixels(horizontal, event.deltaMode, viewport);
      // At the end of a carousel that does not loop the gesture belongs to the
      // page. A rail must never trap the reader's scroll.
      if (delta > 0 ? !emblaApi.canScrollNext() : !emblaApi.canScrollPrev()) return;
      event.preventDefault();

      // One flick is one step: the rest of the momentum is dropped rather than
      // queued up behind the cooldown.
      const now = Date.now();
      if (now < cooldownUntil) return;

      accumulated += delta;
      if (Math.abs(accumulated) < WHEEL_STEP_PX) return;

      if (accumulated > 0) emblaApi.scrollNext();
      else emblaApi.scrollPrev();
      accumulated = 0;
      cooldownUntil = now + WHEEL_COOLDOWN_MS;
      noteInteraction();
    };

    viewport.addEventListener("wheel", onWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", onWheel);
  }, [emblaApi, noteInteraction]);

  // Autoplay. Off with nothing to loop through, off with intervalMs at 0, off
  // under reduced motion. The fourth gate is the pointer or focus resting on
  // the carousel, which is the whole of it under "hover" and the same four
  // gates the hand-built engine used to check before it moved. Under "persist"
  // a resting pointer no longer counts, and the gates are the ones a reader
  // cannot argue with.
  const stopped =
    autoAdvance === "persist"
      ? controlPaused || focusWithin || tabHidden || offScreen || interactions > 0
      : paused;

  // What the timer actually does, named once so the live region below cannot
  // drift from it.
  const advancing = Boolean(loop && intervalMs) && !stopped && !reducedMotion;

  useEffect(() => {
    if (!emblaApi || !advancing) return;
    const timer = window.setInterval(() => emblaApi.scrollNext(), intervalMs);
    return () => window.clearInterval(timer);
  }, [emblaApi, intervalMs, advancing]);

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

  // The control belongs only where the carousel actually moves on its own. A
  // rail that never advances has nothing to pause, and it is "persist" that
  // takes the hover pause away and so owes the reader a replacement.
  const showPauseControl = autoAdvance === "persist" && intervalMs > 0 && loop;

  const togglePauseControl = () => setBannersPaused(!controlPaused);

  return (
    <section
      ref={sectionRef}
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
            // not interrupted by slides nobody asked for. Once it has actually
            // stopped, or if it never rotates, a move is something the reader
            // asked for. This reads the same gate the timer does: under
            // "persist" a resting pointer no longer stops the rail, so it must
            // not flip the announcement either.
            aria-live={advancing ? "off" : "polite"}
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
        <div className="relative mt-3 flex justify-center gap-[3px]">
          {slides.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => {
                noteInteraction();
                emblaApi?.scrollTo(i);
              }}
              aria-label={t("goToSlide", { index: i + 1 })}
              className={`relative h-1 cursor-pointer rounded-full transition-all after:absolute after:top-1/2 after:left-1/2 after:h-11 after:w-11 after:-translate-x-1/2 after:-translate-y-1/2 after:content-[''] ${
                i === selected ? "w-9 bg-white" : "w-3.5 bg-white/45"
              }`}
            />
          ))}
          {/* WCAG 2.2.2 wants a way to stop anything that moves on its own for
              more than five seconds. Hovering was that mechanism until
              "persist"; this is its replacement. Absolutely positioned so the
              dots stay centred on the rail rather than shifting aside to make
              room, and carrying the dots' own 44px hit area on the same
              ::after. The label says what pressing it will do; aria-pressed
              says whether the pause is on. */}
          {showPauseControl ? (
            <button
              type="button"
              onClick={togglePauseControl}
              aria-pressed={controlPaused}
              aria-label={controlPaused ? t("play") : t("pause")}
              className="absolute top-1/2 right-0 flex h-3 w-3 -translate-y-1/2 cursor-pointer items-center justify-center text-white/45 transition-colors after:absolute after:top-1/2 after:left-1/2 after:h-11 after:w-11 after:-translate-x-1/2 after:-translate-y-1/2 after:content-[''] hover:text-white"
            >
              <svg viewBox="0 0 12 12" aria-hidden className="h-3 w-3 fill-current">
                {controlPaused ? <path d="M3 2l7 4-7 4z" /> : <path d="M3 2h2v8H3zm4 0h2v8H7z" />}
              </svg>
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
