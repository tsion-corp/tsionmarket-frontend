"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Whether an element is on screen, for pausing work that only matters when it
 * is being looked at.
 *
 * The dashboard is one long scrolling page: portfolio, spot, perps, memecoins
 * and real assets all mount together on load, and every poll each of them owns
 * starts at once. Someone who opens the site and reads their balance was still
 * paying for the perp desk's five second price poll and its price socket.
 *
 * `rootMargin` runs the observer ahead of the viewport so a section is already
 * warming as it scrolls up, rather than showing a spinner on arrival.
 */
export function useInView<T extends Element>(
  rootMargin = "300px"
): [React.RefObject<T | null>, boolean] {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    // No IntersectionObserver means no way to tell, and going quiet would be
    // worse than the traffic, so treat it as always visible. Deferred rather
    // than set here: a synchronous setState in an effect body is a cascading
    // render, and the lint rule that catches it is right.
    if (typeof IntersectionObserver === "undefined") {
      const id = setTimeout(() => setInView(true), 0);
      return () => clearTimeout(id);
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) setInView(entry.isIntersecting);
      },
      { rootMargin }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [rootMargin]);

  return [ref, inView];
}
