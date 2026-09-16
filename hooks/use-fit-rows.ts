"use client";

import { useLayoutEffect, useState, type RefObject } from "react";

// The phone Market lists (Spot, Memecoins, Leverage) fill the device: each shows
// as many rows as the space left under the header, search field and tab strip
// allows, then paginates the rest. A fixed count strands empty space on a tall
// phone and overflows a short one, so the count is measured from each list's own
// box. All three lists draw 60px rows and sit above the same foot pager, so one
// hook sizes them all.

// Height of a single market row (the h-[60px] rows in the list components).
const ROW_HEIGHT = 60;
// Height the foot pager takes, kept out of the row budget so the last row and
// the pager both sit on screen without the box needing to scroll.
const PAGER_RESERVE = 60;
// Never collapse below a usable handful, even on an unusually short viewport.
const MIN_ROWS = 4;
// Rows assumed before the box has been measured. useLayoutEffect measures and
// corrects this before the browser paints, so it is only ever a first-frame
// guess, never something the reader sees. In a non-layout environment (jsdom
// under test) clientHeight is 0, so this stands in as the page size there.
const FALLBACK_ROWS = 8;

/**
 * How many rows fit in `ref`'s current height, remeasured whenever that height
 * changes (rotation, the keyboard opening, browser chrome sliding away).
 *
 * `ref` must point at the list's own scroll box, whose clientHeight is the
 * height the flex layout gave it, independent of how many rows are inside it. A
 * hidden box (a ticket open over the list) measures 0 and is ignored, so the
 * last real count is kept until the list is shown again.
 *
 * `active` exists because a list behind an inactive tab is not in the DOM at
 * all: the ref is null when this runs at mount, so measuring once there would
 * strand the list on the fallback. Passing whether the list's tab is showing
 * re-runs the measurement the moment the tab mounts the box. It defaults to
 * true for a list that is always present.
 */
export function useFitRows<T extends HTMLElement>(ref: RefObject<T | null>, active = true): number {
  const [rows, setRows] = useState(FALLBACK_ROWS);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !active) return;
    const measure = () => {
      const height = el.clientHeight;
      if (height > 0) {
        setRows(Math.max(MIN_ROWS, Math.floor((height - PAGER_RESERVE) / ROW_HEIGHT)));
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, active]);
  return rows;
}
