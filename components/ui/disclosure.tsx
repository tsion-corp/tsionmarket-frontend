"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * The open/close animation every disclosure on the platform shares: the
 * portfolio allocation ring, the "View Chart" panels on every ticket, the
 * market metrics blocks, the live transactions list, and the rest.
 *
 * Those all used to swap their body in and out with `{open ? <body/> : null}`,
 * which is an instant unmount: the chevron rotated smoothly and the panel
 * underneath it snapped. This animates the panel itself.
 *
 * ## Why grid-template-rows and not height
 *
 * `height` cannot transition to `auto`, so animating a panel by height means
 * measuring the content and hardcoding a pixel figure, which then goes stale
 * the moment the content changes (a chart that loads, a list that grows, a
 * longer locale). The `grid-template-rows: 0fr -> 1fr` trick transitions to
 * the content's own height without anyone ever naming it. `landing/faq-accordion.tsx`
 * already proved it in this codebase; this is that technique lifted into a
 * primitive so every disclosure animates identically instead of each screen
 * inventing its own timing.
 *
 * ## Why the body stays mounted
 *
 * A closed disclosure keeps its children in the tree at `grid-template-rows: 0fr`
 * with `overflow: hidden`, so the collapse can animate rather than vanishing.
 * Two consequences callers must know about:
 *
 * - Anything expensive inside still mounts. A panel whose body opens a socket,
 *   starts a poll or boots a chart iframe should stay gated by the caller
 *   (`{open ? <Chart/> : null}` INSIDE this component's children) so closing it
 *   really does stop the work. Gate on `rendered` rather than on `open`, or the
 *   close will not animate: children removed in the same commit as `open=false`
 *   leave a box that is already zero tall, so there is nothing to interpolate
 *   and the panel folds instantly. `rendered` holds the body for one animation
 *   before dropping it, which is what makes the fold visible AND still stops
 *   the work.
 * - Closed content is hidden visually but not from assistive tech by default,
 *   so `inert` is applied while closed: a screen reader and the tab order both
 *   skip it, matching what an unmounted panel used to do.
 *
 * ## Never put outer spacing on `className`
 *
 * `className` lands on the clip, and the clip is the grid item. A grid item's
 * own margin or padding still counts towards the `0fr` track, so a `mt-4` or a
 * `pt-3` there leaves the SHUT panel standing that many pixels tall — measured
 * at `grid-template-rows: 16px` on a closed panel during this conversion, i.e.
 * dead space under the trigger and no true collapse. `pt-*` fails the same way
 * because the box is border-box.
 *
 * The gap between a trigger and its panel therefore belongs on a wrapper INSIDE
 * the disclosure (`<Disclosure><div className="mt-4">…</div></Disclosure>`),
 * where `overflow: hidden` gives it a block formatting context so it cannot
 * collapse out either. `spacingGuard` below turns the mistake into a loud one
 * rather than a silent 16px.
 */
export interface DisclosureProps {
  /** Whether the panel is open. The caller owns the state. */
  open: boolean;
  /**
   * Ties the panel to the control that toggles it. Pass the same value as the
   * trigger's `aria-controls`, and give the trigger `aria-expanded={open}`.
   */
  id?: string;
  /**
   * The panel's content, or a function receiving `rendered`.
   *
   * `rendered` is `open`, held true for one animation after a close. Gate an
   * expensive body on it — `{(rendered) => (rendered ? <Chart/> : null)}` — so
   * the fold animates and the work still stops once the panel is shut.
   */
  children: ReactNode | ((rendered: boolean) => ReactNode);
  /** Extra classes on the inner (clipping) box, e.g. the panel's own padding. */
  className?: string;
}

// 300ms with a soft ease-out: long enough to read as a panel unfolding, short
// enough that a second press does not feel blocked. `motion-reduce:transition-none`
// is the app's convention for honouring prefers-reduced-motion in a class
// rather than a media query read in JavaScript, so the panel still opens and
// closes, it just does it instantly.
const MOTION =
  "transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(.2,.7,.2,1)] motion-reduce:transition-none";

// Outer spacing on the clip does not collapse with the track, so it is a silent
// layout bug rather than a cosmetic slip. Caught in development only: the class
// list is a literal at every call site, so this cannot vary at runtime, and
// production carries none of the cost.
function spacingGuard(className: string): void {
  if (process.env.NODE_ENV === "production" || !className) return;
  const offender = className.split(/\s+/).find((c) => /^-?(mt|mb|my|m|pt|pb|py|p)-/.test(c));
  if (offender) {
    console.error(
      `Disclosure: "${offender}" on className sits on the grid item, so a closed ` +
        `panel keeps that spacing and never collapses to zero. Move it to a ` +
        `wrapper inside the Disclosure instead.`
    );
  }
}

// Long enough for the collapse above to finish before an expensive body is
// dropped. Kept just over the transition so the unmount never clips the fold.
const UNMOUNT_AFTER_MS = 320;

export function Disclosure({ open, id, children, className = "" }: DisclosureProps) {
  spacingGuard(className);

  // `open` is the truth for the animation; `rendered` lags it on the way down so
  // a gated body survives the fold. On the way up they are the same tick.
  //
  // Opening is handled during render rather than in an effect: React's own
  // adjust-state-while-rendering pattern. An effect that called setState here
  // would run a frame late, so a gated body would miss the first frame of its
  // own open, and it would also be a synchronous setState inside an effect —
  // the cascading-render lint the repo enforces. Only the CLOSE needs a timer,
  // because only the close has to outlive the transition.
  const [rendered, setRendered] = useState(open);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  if (open && !rendered) setRendered(true);

  useEffect(() => {
    if (open) return;
    closeTimer.current = setTimeout(() => setRendered(false), UNMOUNT_AFTER_MS);
    return () => {
      if (closeTimer.current !== null) clearTimeout(closeTimer.current);
      closeTimer.current = null;
    };
  }, [open]);

  return (
    <div
      id={id}
      // `grid` with a single row is what makes the 0fr/1fr transition possible.
      className={`grid ${MOTION} ${
        open ? "[grid-template-rows:1fr] opacity-100" : "[grid-template-rows:0fr] opacity-0"
      }`}
      // Closed content is out of the tab order and unread, the way an
      // unmounted panel was. `inert` also blocks pointer events, so a
      // collapsed panel cannot be clicked through.
      inert={!open}
    >
      {/* The clip. `min-h-0` matters: a grid row at 0fr still gives its item an
          automatic minimum size unless told otherwise, which would leave the
          panel's first line peeking out while closed. */}
      <div className={`min-h-0 overflow-hidden ${className}`}>
        {typeof children === "function" ? children(rendered) : children}
      </div>
    </div>
  );
}
