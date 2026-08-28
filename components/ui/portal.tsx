"use client";

import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

/**
 * Renders children at the end of <body>, outside whatever tree asked for them.
 *
 * This exists because of a CSS rule that bites overlays specifically: an
 * ancestor with a transform (or filter, or backdrop-filter) becomes the
 * containing block for `position: fixed` descendants, so `fixed inset-0` stops
 * meaning "the viewport" and starts meaning "that ancestor". The sidebar slides
 * with translate-x, so a dialog opened from inside it — Go Live, for one — was
 * pinned into a 248px column instead of covering the screen.
 */

// Never notifies, so the value is read once per environment and never changes.
const subscribe = () => () => {};

/**
 * False while rendering on the server, true in the browser.
 *
 * useSyncExternalStore rather than an effect that sets state: document.body
 * does not exist server-side, and this way the two renders disagree by design
 * instead of by a post-mount state flip, which React's compiler rules (rightly)
 * flag as a cascading render.
 */
function useIsClient(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false
  );
}

export function Portal({ children }: { children: React.ReactNode }) {
  if (!useIsClient()) return null;
  return createPortal(children, document.body);
}
