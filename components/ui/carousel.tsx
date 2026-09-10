"use client";

import { Children, useCallback, useEffect, useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { ChevronLeftIcon } from "@/components/ui/icons";

// How long one slide movement takes. Long enough to read as motion, short
// enough that a second press does not feel blocked.
const SLIDE_MS = 420;

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

// The floating control's disc. 38 is the size the redesign already draws a
// round icon button at: the notification bell's disc is `size-[38px]`. The
// narrow figure is the same control on a one-up frame, where a full-width card
// has both discs over it and the pair has to stop crowding the artwork between
// them. Each disc is centred on the frame's edge, so half of this width hangs
// outside the frame and there is no inset to set.
const CONTROL_PX = 38;
const CONTROL_PX_ONE_UP = 32;

// Bring any integer back into [0, count).
function wrap(index: number, count: number) {
  return ((index % count) + count) % count;
}

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

// A looping carousel: it shows `perView` slides plus a sliver of the next one,
// advances on a timer, and floats a previous and a next control on the frame's
// two edges, each straddling its edge, level with the middle of the slides.
//
// Each child is wrapped in a slide of the carousel's own width, so a caller
// hands over cards with no width of their own and the carousel divides the row.
//
// Slides are sized in CSS rather than measured, so the first paint on the server
// is already the finished layout and hydration moves nothing. That includes the
// drop to one slide on a narrow frame, which is a container query rather than a
// media query read in JavaScript: a phone gets the one-up layout in its first
// paint instead of being handed the two-up layout and reflowed.
//
// Looping is done with clones. The real slides are flanked by copies of
// themselves, so a step off either end still lands on a full frame; once the
// movement has finished the position jumps back to the matching real slide with
// the transition switched off, which is invisible because the two frames are
// identical. Clones are `inert` and hidden from assistive technology, so they
// are neither read out twice nor tabbed through.
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
  const loops = count > 1;

  // Enough copies on each side to fill the frame during a step off either end.
  // The clones cover the frame while cloneCount * (slide + gapPx) >= frame, and a
  // trim shrinks `slide`, so it eats into that margin. For the two-up default
  // with a 50px trim and a 12px gap the trim only applies from a 1045.71px frame
  // up, where three clones cover 1331.82px, and the margin only widens from
  // there. A much larger trim would need this raised.
  const cloneCount = loops ? Math.max(1, Math.ceil(perView + peek)) : 0;

  const [position, setPosition] = useState(0);
  // On by default, including on the server: the position does not change during
  // hydration, so a transition that is already declared has nothing to animate.
  // It comes off only for the frame in which the carousel jumps back from a
  // clone to the real slide underneath it.
  const [animate, setAnimate] = useState(true);
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  const positionRef = useRef(0);
  const slideTimerRef = useRef<number | null>(null);
  const frameRef = useRef<number | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const trackId = useId();

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReducedMotion(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  useEffect(
    () => () => {
      if (slideTimerRef.current !== null) window.clearTimeout(slideTimerRef.current);
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
    },
    []
  );

  // Put a slide at the left edge with no movement, then put the transition back
  // two frames later. Two frames, because re-enabling the transition in the same
  // paint as the jump would animate the jump.
  const jumpTo = useCallback((index: number) => {
    if (slideTimerRef.current !== null) {
      window.clearTimeout(slideTimerRef.current);
      slideTimerRef.current = null;
    }
    if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
    positionRef.current = index;
    setAnimate(false);
    setPosition(index);
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = window.requestAnimationFrame(() => {
        frameRef.current = null;
        setAnimate(true);
      });
    });
  }, []);

  const move = useCallback(
    (delta: number) => {
      // One movement at a time, which is what keeps the clone count enough.
      if (!loops || slideTimerRef.current !== null) return;
      const next = positionRef.current + delta;
      if (reducedMotion) {
        jumpTo(wrap(next, count));
        return;
      }
      positionRef.current = next;
      setPosition(next);
      // The movement can end on a clone. Once it has arrived, swap to the real
      // slide underneath it.
      slideTimerRef.current = window.setTimeout(() => {
        slideTimerRef.current = null;
        const settled = wrap(positionRef.current, count);
        if (settled !== positionRef.current) jumpTo(settled);
      }, SLIDE_MS);
    },
    [count, jumpTo, loops, reducedMotion]
  );

  useEffect(() => {
    if (!loops || !intervalMs || paused || reducedMotion) return;
    const timer = window.setInterval(() => move(1), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs, loops, move, paused, reducedMotion]);

  // The slide width has to change with the frame, and a width that changes with
  // the frame cannot be an inline style. It goes in a rule of its own, keyed to
  // this carousel's track, and everything that needs the width reads the
  // property rather than repeating the arithmetic.
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

  // The controls shrink on a narrow frame for the same reason the slides do, so
  // they are sized the same way: a rule keyed to this carousel, read through a
  // custom property. It has to land on the control layer rather than on the
  // frame, because a container query styles a container's descendants and the
  // frame is the container. Emitted whatever `perView` is: a one-slide frame is
  // narrow even when the carousel was never showing two.
  const controlSelector = `[data-ws-carousel-controls="${trackId}"]`;
  const controlRule = `${controlSelector}{--ws-carousel-control:${CONTROL_PX}px}`;
  const controlOneUpRule = `@container ws-carousel (width < ${ONE_UP_BELOW}px){${controlSelector}{--ws-carousel-control:${CONTROL_PX_ONE_UP}px}}`;

  const offset = cloneCount + position;

  // Lead clones are the tail of the list, trail clones are its head. Both are
  // taken cyclically, so a carousel with fewer slides than it shows still fills.
  // `slot` is where each one stands in the track's own coordinates, the ones
  // `position` is measured in: the real slides are 0 to count-1, the lead
  // clones are below 0 and the trail clones from count up.
  const rendered = [
    ...Array.from({ length: cloneCount }, (_, i) => ({
      key: `lead-${i}`,
      index: wrap(count - cloneCount + i, count),
      slot: i - cloneCount,
      clone: true,
    })),
    ...slides.map((_, index) => ({ key: `slide-${index}`, index, slot: index, clone: false })),
    ...Array.from({ length: cloneCount }, (_, i) => ({
      key: `trail-${i}`,
      index: wrap(i, count),
      slot: count + i,
      clone: true,
    })),
  ];

  // A clone is switched off, except while it is in the frame. The frame is
  // `cloneCount` slots wide from the position, and on the last real position
  // the slots beside it are clones: three slides two-up, standing on the
  // third, show the third and a copy of the first. That copy is what the
  // reader sees and what they click, so it has to be live. The clones behind
  // the frame stay inert so nothing is read out or tabbed through twice.
  const inFrame = (slot: number) => slot >= position && slot < position + cloneCount;

  // The redesign's round icon button, taken to artwork.
  //
  // Shape, hairline and glyph are the shell's own disc: the notification bell
  // (`size-[38px] rounded-full border border-white/12`) and the balance card's
  // eye toggle (`size-[45.87px] rounded-full border-[1.21px] border-white/14`)
  // are both a translucent circle with a white hairline and a white glyph, and
  // that, not a solid white pill, is how this design draws a round control.
  //
  // Two things change because these float over cards rather than over the page.
  // The fill is the bell's dark variant (`bg-black/[0.19]`) deepened to 0.72 of
  // `--color-ink`, the redesign's near-black, over an 18px backdrop blur taken
  // from `ws-glass`: it is what keeps a white chevron legible on the yellow
  // Token Moves card and on the lavender arena card, and it is contrast rather
  // than a shadow doing it. The hairline is raised from the shell's white/14 to
  // white/45, because white/14 separates a disc from black page but not from
  // the near-black Pepe card; over that card white/45 lands on about #7c7c7c,
  // inside the band the design already edges its own dark cards with (#989898
  // on the meme card, #bab4b4 at the top of the Next 100X card edge).
  //
  // The top-down white wash is `ws-card`'s inner top-edge highlight, drawn as a
  // background layer because that utility draws it as an inset box-shadow and
  // nothing clickable in this round carries a shadow.
  //
  // Focus takes the Kash yellow, which is how the design already rings a round
  // control: the Kash card's buy and send actions are white pills bordered
  // `#FFD52D`. An outline, not a ring: Tailwind compiles `ring-*` to a shadow.
  const control =
    "ws-pressable pointer-events-auto grid shrink-0 cursor-pointer place-items-center rounded-full border border-white/45 text-white backdrop-blur-[18px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kash";

  const controlStyle = {
    width: "var(--ws-carousel-control)",
    height: "var(--ws-carousel-control)",
    backgroundColor: "rgba(10, 10, 10, 0.72)",
    backgroundImage: "linear-gradient(180deg, rgba(255,255,255,0.18), rgba(255,255,255,0) 58%)",
  };

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
      <style>{widthRule + trimRule + oneUpRule + controlRule + controlOneUpRule}</style>
      {/* The frame. It is the measuring box and nothing else: it holds the
          container query and the controls' positioning context, and it does not
          clip. The clip belongs one level down, on the viewport, so a control
          anchored here can hang past the frame's edge instead of being cut off
          by the box that hides the track.
          `container-type: inline-size` contains layout, style and inline size.
          None of those is paint containment, so the outer half of a disc is
          drawn; and layout containment makes this the containing block the
          controls are placed against, which is what `relative` is here for too.
          It is the same width as the viewport it wraps, so every container query
          below reads exactly the figure it read when the viewport was the
          container. Named, so the one-up rule cannot be answered by some other
          container the page happens to have declared further up the tree. */}
      <div
        className="relative"
        style={{ containerType: "inline-size", containerName: "ws-carousel" }}
      >
        <div
          ref={viewportRef}
          className="overflow-hidden"
          // `overflow-hidden` still scrolls when a child off to the right takes
          // focus, which would slide the whole row out from under the transform.
          // The transform is the only thing that moves this row, so put the
          // scroll back and bring the focused slide to the front instead. Only
          // for keyboard focus: a click on the peeked slide should not shuffle
          // the row out from under the pointer.
          onFocusCapture={(event) => {
            const viewport = viewportRef.current;
            if (viewport) viewport.scrollLeft = 0;
            const target = event.target as HTMLElement;
            if (!focusedByKeyboard(target)) return;
            const slide = target.closest<HTMLElement>("[data-carousel-slide]");
            const index = Number(slide?.dataset.carouselSlide);
            if (slide && !Number.isNaN(index) && index !== positionRef.current) jumpTo(index);
          }}
        >
          <div
            data-ws-carousel={trackId}
            // Off while the carousel advances on its own, so a screen reader is
            // not interrupted by slides nobody asked for. Once it is paused, or
            // if it never rotates, a move is something the reader asked for.
            aria-live={paused || !intervalMs ? "polite" : "off"}
            className={`flex ${
              animate && !reducedMotion
                ? "transition-transform duration-[420ms] ease-out motion-reduce:transition-none"
                : ""
            }`}
            style={{
              gap: gapPx,
              transform: `translate3d(calc((var(--ws-carousel-slide) + ${gapPx}px) * ${-offset}), 0, 0)`,
            }}
          >
            {rendered.map(({ key, index, slot, clone }) => (
              <div
                key={key}
                // The clones render the same element twice. Slides are artwork
                // and links, so there is no state to keep in step; anything
                // stateful belongs above the carousel, not on a slide.
                role="group"
                aria-roledescription="slide"
                aria-hidden={(clone && !inFrame(slot)) || undefined}
                inert={clone && !inFrame(slot)}
                data-carousel-slide={clone ? undefined : index}
                className="shrink-0"
                style={{ width: "var(--ws-carousel-slide)" }}
              >
                {slides[index]}
              </div>
            ))}
          </div>
        </div>

        {loops ? (
          // The two controls straddle the frame's two edges, each disc centred
          // on its edge so half of it lies over the slides and half over the
          // page, level with the middle of the slides.
          //
          // They are one layer rather than two separately placed buttons, so
          // `justify-between` puts them on the two edges and `items-center`
          // centres them without a transform. That matters: `ws-pressable` is a
          // transform, and a control centred by one would drop back to the top
          // of the frame the moment a pointer touched it.
          //
          // The straddle is done by pulling the layer's own inline edges out by
          // half a disc rather than by translating each button, for the same
          // reason. The layer is a sibling of the viewport, not a child of it:
          // the viewport clips, and a child of it could not hang outside.
          //
          // The layer takes no pointer events, so only the two discs sit over a
          // card, and each covers half the width it used to. The next control
          // lands on the peek, the sliver of the following slide, which is not a
          // target anybody aims at; the previous control keeps its inner half
          // over the first card's left edge, level with the middle of the card,
          // where these cards carry artwork rather than words.
          <div
            data-ws-carousel-controls={trackId}
            className="pointer-events-none absolute top-0 bottom-0 flex items-center justify-between"
            style={{ insetInline: "calc(var(--ws-carousel-control) / -2)" }}
          >
            <button
              type="button"
              onClick={() => move(-1)}
              aria-label={t("previous")}
              className={control}
              style={controlStyle}
            >
              <ChevronLeftIcon size={16} />
            </button>
            <button
              type="button"
              onClick={() => move(1)}
              aria-label={t("next")}
              className={control}
              style={controlStyle}
            >
              <ChevronLeftIcon size={16} className="rotate-180" />
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
