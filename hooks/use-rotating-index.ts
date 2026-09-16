"use client";

import { useEffect, useState } from "react";

/** Ten seconds, the cadence the discovery cards rotate at unless told otherwise. */
const DEFAULT_INTERVAL_MS = 10_000;

export interface RotatingIndexOptions {
  /** Milliseconds between advances. Defaults to ten seconds. */
  intervalMs?: number;
  /**
   * Holds the current index and runs no timer while true.
   *
   * WCAG 2.2.2 (Pause, Stop, Hide) requires a way to stop content that starts
   * automatically, updates itself, and runs longer than five seconds. This
   * hook auto-advances forever, so `paused` is that mechanism, not a nicety:
   * callers wire it to hover and focus-within so a pointer or a keyboard can
   * hold a card still and read it. Do not remove it, and do not ship a caller
   * that leaves it unwired.
   */
  paused?: boolean;
}

/**
 * The index of the item currently showing in a set that cycles on a timer,
 * wrapping `0 … count-1` forever.
 *
 * It knows nothing about what it is cycling through. Give it a count, read
 * back an index.
 *
 * Rotation also stops while the tab is in the background. A hidden tab throttles
 * its timers rather than stopping them, so without this a backgrounded card
 * either burns a timer nobody is watching or races through the queued advances
 * on return, landing the reader on an item several steps from the one they left.
 */
export function useRotatingIndex(count: number, options?: RotatingIndexOptions): number {
  const intervalMs = options?.intervalMs ?? DEFAULT_INTERVAL_MS;
  const paused = options?.paused ?? false;

  const [index, setIndex] = useState(0);
  // Starts false so the server and the first client paint agree. The effect
  // below corrects it on mount for a tab that was already hidden, which changes
  // no rendered value: the index is 0 either way.
  const [tabHidden, setTabHidden] = useState(false);

  useEffect(() => {
    const sync = () => setTabHidden(document.hidden);
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, []);

  useEffect(() => {
    // Nothing to cycle through, or someone is holding it still. No timer at all,
    // so the index sits where it is and resumes from there rather than jumping.
    if (count <= 1 || paused || tabHidden) return;

    const timer = setInterval(() => {
      // Step from the clamped position, so a count that shrank under us
      // advances from the item on screen rather than from a stale index.
      setIndex((current) => (Math.min(current, count - 1) + 1) % count);
    }, intervalMs);
    return () => clearInterval(timer);
  }, [count, paused, tabHidden, intervalMs]);

  // Clamped on the way out too. Live data can shrink the set between the last
  // advance and this render, and the caller must never be handed an index that
  // reads back undefined.
  return count > 1 ? Math.min(index, count - 1) : 0;
}
