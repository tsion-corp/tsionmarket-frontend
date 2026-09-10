"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * How many fixed-height rows fit in the space a container actually has.
 *
 * Both desk tables stretch to the viewport, and both paginate at a count fixed
 * when the design was drawn: nine on spot, ten on the memecoin desk. On a tall
 * window that leaves the bottom third of the card empty above the pager. This
 * hook reads the space and reports the number of rows that fill it, so the page
 * size follows the window instead of the comp.
 *
 * ## The measured element must contribute no height of its own
 *
 * This is the one rule, and getting it wrong produces a runaway rather than a
 * wrong number: measure a box whose height grows with its content, add a row
 * because the box got taller, and the box gets taller again.
 *
 * `grow min-h-0 overflow-hidden` is NOT enough on its own, and this was
 * measured rather than reasoned. Both desks hang off a chain of *min*-heights
 * up to the route, so the panel's height is indefinite, and a basis-zero flex
 * item in an indefinite column is still sized by its content. On the memecoin
 * desk that produced sticky hysteresis: dragging 1200px down to 700px held on
 * to 15 rows and left the panel 959px tall inside a 700px window, with the
 * pager below the fold.
 *
 * Two shapes actually work:
 *
 * - Put the rows in an `absolute inset-0` layer inside a `relative min-h-0
 *   flex-1 overflow-hidden` box, so they contribute height to nothing. This is
 *   what the memecoin desk does, and it settles at 682/10 on the same drag.
 * - Or measure a box whose height is definite, which is the spot desk's case.
 *
 * Whichever you pick, also slice the rows to the fitted count. A board that
 * renders more rows than fit is relying on the hidden overflow to hide them,
 * and that is what makes the measurement lie.
 *
 * ## Tests
 *
 * The measurement comes from ResizeObserver, so a jsdom test with no stub gets
 * `fallbackRows` and nothing else. A test that needs a fitted count has to
 * stub a ResizeObserver that reports on observe.
 *
 * `rowHeight` must likewise be the row's real outer height, border included. A
 * value even a pixel under the truth compounds over ten rows and fits one row
 * too many, which the container then clips.
 */
export interface FittedRowCountOptions {
  /** Outer height of one row in CSS pixels, borders included. */
  rowHeight: number;
  /**
   * Rows to report before the first measurement, and on any render where the
   * space cannot be read. This is what the server renders and what the client
   * hydrates with, so it must be the design's own count: a mismatch here is a
   * hydration mismatch.
   */
  fallbackRows: number;
  /** Never report fewer than this, however short the window. */
  minRows?: number;
  /** Never report more than this. Omit for no ceiling. */
  maxRows?: number;
  /**
   * False keeps the hook at `fallbackRows` and attaches no observer. Used for
   * the branch that is not on screen, so the phone's board does not measure a
   * desktop panel that is not rendered.
   */
  enabled?: boolean;
}

export interface FittedRowCount<T extends HTMLElement = HTMLDivElement> {
  /** Attach to the element whose height is the space available for rows. */
  ref: (node: T | null) => void;
  /** Rows that fit. `fallbackRows` until the space has been measured. */
  rows: number;
}

/**
 * The rows that fit in `height`, clamped.
 *
 * Exported for tests: the arithmetic is worth pinning without a layout engine.
 * A height that is not a usable number reports the fallback rather than zero,
 * so a detached or display:none container leaves the table as the design drew
 * it instead of blanking it.
 */
export function rowsForHeight(
  height: number,
  { rowHeight, fallbackRows, minRows = 1, maxRows }: FittedRowCountOptions
): number {
  if (!Number.isFinite(height) || height <= 0) return fallbackRows;
  if (!Number.isFinite(rowHeight) || rowHeight <= 0) return fallbackRows;
  // Floor, never round. A row that half fits is a row the container clips.
  const fits = Math.floor(height / rowHeight);
  const floor = Math.max(1, minRows);
  const ceiling = maxRows === undefined ? Number.POSITIVE_INFINITY : maxRows;
  return Math.min(Math.max(fits, floor), ceiling);
}

export function useFittedRowCount<T extends HTMLElement = HTMLDivElement>(
  options: FittedRowCountOptions
): FittedRowCount<T> {
  const { rowHeight, fallbackRows, minRows, maxRows, enabled = true } = options;
  const [rows, setRows] = useState(fallbackRows);
  // The element is held in state rather than a ref because the effect below has
  // to re-run when it changes, and writing a ref would not tell it to. A ref
  // callback runs after the commit, so setting state here is not a render-phase
  // write.
  const [node, setNode] = useState<T | null>(null);
  const ref = useCallback((next: T | null) => setNode(next), []);

  useEffect(() => {
    if (!enabled || !node) return;
    // ResizeObserver is in every browser this app supports but not in every
    // test environment, so its absence leaves the fallback count standing
    // rather than throwing.
    if (typeof ResizeObserver === "undefined") return;

    const read = () => {
      const next = rowsForHeight(node.getBoundingClientRect().height, {
        rowHeight,
        fallbackRows,
        minRows,
        maxRows,
      });
      // Only a real change is written. The observer fires on every layout pass,
      // and a set with an unchanged value would still re-render the table.
      setRows((current) => (current === next ? current : next));
    };

    // The first measurement comes from the observer, not from a setState in
    // this effect body: ResizeObserver fires once as soon as it starts
    // observing, carrying the box's current size. That is also what catches a
    // font or an image landing after paint.
    const observer = new ResizeObserver(read);
    observer.observe(node);
    return () => observer.disconnect();
  }, [enabled, node, rowHeight, fallbackRows, minRows, maxRows]);

  // Disabled reports the fallback without the state ever being consulted, so a
  // count measured before the branch was switched off cannot leak through.
  return { ref, rows: enabled ? rows : fallbackRows };
}
