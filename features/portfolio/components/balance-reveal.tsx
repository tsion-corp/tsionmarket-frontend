"use client";

import { useEffect, useRef, useState } from "react";
import {
  cardForProgress,
  revealDistance,
  revealProgress,
  revealStart,
} from "@/lib/portfolio/balance-reveal";

// Drives the phone portfolio's balance cards from the scroll the reader is
// already doing, so both balances are seen without anyone having to discover
// the sideways swipe.
//
// This adds NO height and moves NO layout. It renders a plain wrapper, measures
// where that wrapper is, and hands the card index down. The promo strip below
// sits exactly where it always did.
//
// Two earlier versions are recorded in lib/portfolio/balance-reveal.ts: a pin
// that bought its hold with page height and left a gap, and a rect-based
// reveal that started as the block went under the header and therefore finished
// with it half gone. This one measures PAGE scroll against the block's document
// offset, so the move completes while the cards are still entirely on screen.
//
// The scroll handler only marks a frame dirty; one requestAnimationFrame loop
// reads the geometry. Driving this through React state would re-render the
// portfolio sixty times a second — the same reasoning as hooks/use-scroll-
// journey.ts, which is the pattern this follows. Only the card index reaches
// React, and only when it changes, which is at most twice per pass.
//
// The maths is in lib/portfolio/balance-pin.ts, where it can be tested: jsdom
// does not scroll.

// Where the reveal starts, measured down from the top of the viewport: roughly
// the bottom of the sticky phone header.
//
// A constant rather than a measurement of the real header, and that is a
// deliberate trade. The header is 67px today and content-driven, so this is
// approximate — but the only thing the number decides is WHEN in the scroll the
// card turns over, and being a few pixels early or late is not perceptible.
// Measuring the header would mean either a custom property nothing publishes
// today or this component reaching up the tree for an element it does not own,
// and neither is worth buying a precision that cannot be seen.
const REVEAL_START = 64;

export function BalanceReveal({
  children,
}: {
  children: (card: number | undefined) => React.ReactNode;
}) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [card, setCard] = useState<number | undefined>(undefined);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    const reduceQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    // Plain variables, not state: the loop reads them every frame and a
    // re-render per change is the thing this file exists to avoid.
    let reduced = reduceQuery.matches;
    let distance = 0;
    let current = 0;
    let dirty = true;
    let frame = 0;
    let scheduled = false;
    // Whether a frame is already booked. A separate flag from the handle
    // because `frame = requestAnimationFrame(read)` assigns AFTER the callback
    // has run if frames are synchronous, which would clobber the 0 that read
    // wrote and latch the guard shut forever. The flag is cleared by the
    // callback itself, so it cannot be overwritten by its own scheduling.

    const measure = () => {
      // Under reduced motion nothing is driven at all. The house rule in
      // globals.css is that nothing may translate; a card sliding across on
      // its own is motion, so this becomes the plain swipe carousel it was.
      distance = reduced ? 0 : revealDistance(window.innerHeight);
      dirty = true;
    };

    const read = () => {
      scheduled = false;
      if (!dirty) return;
      dirty = false;
      if (distance <= 0) {
        setCard((prev) => (prev === undefined ? prev : undefined));
        return;
      }
      // The block's offset from the top of the DOCUMENT, re-read each frame.
      // `rect.top + scrollY` does not change as the page scrolls, so this costs
      // one layout read and cannot go stale the way a value cached on mount
      // would when something above the block loads in and pushes it down.
      //
      // Reading the rect ALONE is wrong, and was wrong here for one revision:
      // it moves under the very thing being measured, so the progress ran
      // backwards as the reader scrolled forwards.
      const blockTop = wrapper.getBoundingClientRect().top + window.scrollY;
      const start = revealStart(blockTop, REVEAL_START, window.innerHeight, distance);
      const progress = revealProgress(window.scrollY, start, distance);
      const next = cardForProgress(progress, current);
      if (next === current) return;
      current = next;
      setCard(next);
    };

    const onScroll = () => {
      dirty = true;
      if (scheduled) return;
      scheduled = true;
      frame = requestAnimationFrame(read);
    };
    const onResize = () => {
      measure();
      onScroll();
    };
    const onReduceChange = () => {
      reduced = reduceQuery.matches;
      onResize();
    };

    measure();
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    reduceQuery.addEventListener("change", onReduceChange);
    return () => {
      if (frame !== 0) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      reduceQuery.removeEventListener("change", onReduceChange);
    };
  }, []);

  return <div ref={wrapperRef}>{children(card)}</div>;
}
