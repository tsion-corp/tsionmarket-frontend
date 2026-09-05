"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Whether an element is on screen, for pausing work that only matters when it
 * is being looked at.
 *
 * The dashboard is one long scrolling page: portfolio, spot, perps, memecoins
 * and real assets all mount together on load, and every poll each of them owns
 * starts at once. Someone who opens the site and reads their balance was still
 * paying for the perp desk's five second price poll and its price socket.
 *
 * A CALLBACK ref, not a ref object read from an effect. The first version read
 * `ref.current` once in an effect with constant deps, so an element that
 * mounted later never got observed and its consumer sat at `false` forever.
 * The perp chart on a phone is exactly that: it lives inside a trade sheet
 * that renders null until opened, so the chart never appeared at all. A
 * callback ref runs whenever the node attaches or detaches, which is the only
 * thing that handles a late mount correctly.
 */

/**
 * How long a section stays awake after scrolling out of view.
 *
 * Without it, flick-scrolling past the perp desk tore down and rebuilt its
 * price socket on every pass. Leaving is delayed, arriving is not, so nothing
 * is ever slower to appear than it was.
 */
const LEAVE_GRACE_MS = 2_000;

export function useInView<T extends Element>(
  rootMargin = "300px"
): [(node: T | null) => void, boolean] {
  const [inView, setInView] = useState(false);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearLeave = () => {
    if (leaveTimer.current) {
      clearTimeout(leaveTimer.current);
      leaveTimer.current = null;
    }
  };

  const ref = useCallback(
    (node: T | null) => {
      observerRef.current?.disconnect();
      observerRef.current = null;
      clearLeave();
      if (!node) return;

      // No IntersectionObserver means no way to tell, and going quiet would be
      // worse than the traffic. Treat it as always visible. Safe to set here:
      // a callback ref is not an effect body, so this is not a cascading
      // render the way a synchronous setState in an effect would be.
      if (typeof IntersectionObserver === "undefined") {
        setInView(true);
        return;
      }

      const observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              clearLeave();
              setInView(true);
            } else if (!leaveTimer.current) {
              leaveTimer.current = setTimeout(() => {
                leaveTimer.current = null;
                setInView(false);
              }, LEAVE_GRACE_MS);
            }
          }
        },
        { rootMargin }
      );
      observer.observe(node);
      observerRef.current = observer;
    },
    [rootMargin]
  );

  useEffect(
    () => () => {
      observerRef.current?.disconnect();
      clearLeave();
    },
    []
  );

  return [ref, inView];
}
