"use client";

import { useEffect, useRef } from "react";
import { recordPostView } from "@/lib/api/market-square";

/**
 * Posts already counted this page load.
 *
 * Module-level rather than per-component, because the same post appears in
 * several cached lanes: scrolling for-you, switching to a topic and scrolling
 * back would otherwise report the same person seeing it three times. The
 * service counts distinct people and ignores repeats anyway — this is about
 * not making the request at all.
 */
const counted = new Set<string>();

/** How much of the card must be on screen, and for how long, to count as seen. */
const VISIBLE_RATIO = 0.5;
const DWELL_MS = 1000;

/**
 * Reports a post as seen once it has actually been looked at.
 *
 * Not on render — a feed renders a page of posts the reader may never scroll
 * to, and counting those would inflate every author's numbers with views that
 * did not happen. Half the card visible for a full second is the threshold,
 * so a fast scroll past does not register either.
 *
 * Failures are swallowed on purpose: a view that goes unrecorded is invisible
 * to the reader, and there is nothing useful to tell them about it.
 */
export function useRecordView(postId: string): (node: HTMLElement | null) => void {
  const timer = useRef<number>(0);
  const observer = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
      observer.current?.disconnect();
    };
  }, []);

  return (node: HTMLElement | null) => {
    observer.current?.disconnect();
    if (!node || counted.has(postId)) return;
    // Older browsers without the observer simply do not report views, rather
    // than falling back to counting on render — which would be wrong data.
    if (typeof IntersectionObserver === "undefined") return;

    observer.current = new IntersectionObserver(
      (entries) => {
        const visible = entries.some((entry) => entry.isIntersecting);
        if (!visible) {
          if (timer.current) window.clearTimeout(timer.current);
          timer.current = 0;
          return;
        }
        if (timer.current || counted.has(postId)) return;
        timer.current = window.setTimeout(() => {
          timer.current = 0;
          if (counted.has(postId)) return;
          counted.add(postId);
          observer.current?.disconnect();
          void recordPostView(postId).catch(() => {
            // Let it be retried on a later page load rather than pretending
            // it landed.
            counted.delete(postId);
          });
        }, DWELL_MS);
      },
      { threshold: VISIBLE_RATIO }
    );
    observer.current.observe(node);
  };
}
