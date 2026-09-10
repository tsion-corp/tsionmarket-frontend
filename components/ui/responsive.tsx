import type { ReactNode } from "react";

// The single seam between the phone design and the desktop one. A screen hands
// it two ready-made trees and CSS shows the one that fits the viewport, so the
// right layout is correct on the first paint with no JavaScript, no hydration
// flash, and no reflow. This is the default for plain markup.
//
// Both wrappers use `display: contents`, so they add no box of their own: the
// tree inside participates in the parent's flow (grid, flex, spacing) exactly
// as if it were written there directly. That is why a screen can pass a grid or
// a flex row here without the seam getting in the way.
//
// When a branch costs a request or a subscription (a chart, a data-fetching
// section), do NOT use this: both trees mount and both would pay that cost.
// Reach for useIsMobile() instead so only the visible tree mounts.
export function Responsive({ mobile, desktop }: { mobile: ReactNode; desktop: ReactNode }) {
  return (
    <>
      <div className="contents md:hidden">{mobile}</div>
      <div className="hidden md:contents">{desktop}</div>
    </>
  );
}
