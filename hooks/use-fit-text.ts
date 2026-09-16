"use client";

import { useLayoutEffect, useRef, useState } from "react";

/**
 * The scale a single line of text needs to fit the box it sits in, measured on
 * the rendered element.
 *
 * For a headline drawn against fixed artwork: it cannot wrap and cannot push
 * anything aside, so the type is the thing that gives. The caller sets the
 * element's font size to its design size times `scale`, keeps the element
 * `whitespace-nowrap` with `min-w-0` inside a flex row, and this brings the
 * scale down until the text fits, or up to 1 when the box has room. Measured
 * from the element itself rather than a table of glyph widths, so it holds
 * for whatever face the app renders in, including a fallback while the
 * display face loads; re-measured when the box resizes and once the fonts
 * are ready.
 *
 * `estimate` is the first paint's guess, before anything can be measured:
 * roughly the text's width in ems of its font size at 1, against the box the
 * caller expects in the same unit. Under jsdom nothing has a size, so the
 * measurement is skipped and the estimate stands.
 */
export function useFitText<T extends HTMLElement = HTMLElement>(
  text: string,
  estimate = 1
): {
  ref: React.RefObject<T | null>;
  scale: number;
} {
  const ref = useRef<T>(null);
  const [scale, setScale] = useState(() => Math.min(1, estimate));

  // Depends on the scale it corrects: after a correction the text is drawn at
  // the new size, the measurement repeats, and the guard stops it once the two
  // agree. That is one extra pass, not a loop.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      const natural = el.scrollWidth / scale;
      if (natural <= 0 || el.clientWidth <= 0) return;
      const next = Math.min(1, el.clientWidth / natural);
      if (Math.abs(next - scale) > 0.005) setScale(next);
    };
    fit();
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(fit) : null;
    observer?.observe(el);
    if (typeof document !== "undefined" && "fonts" in document) {
      void document.fonts.ready.then(fit);
    }
    return () => observer?.disconnect();
  }, [text, scale]);

  return { ref, scale };
}
