"use client";

import { createContext, useContext, type CSSProperties, type ReactNode } from "react";
import { FILM } from "@/lib/landing/journey";

// The landing renders in one of two modes. On film-capable viewports the
// layers are absolute sheets inside a fixed stage and the scroll engine
// drives every reveal. On small screens the same layers render as normal
// stacked sections over their waypoint stills — natural heights, readable
// type, no videos on a phone connection — which is the handoff's own
// fallback for constrained devices.
type JourneyMode = "film" | "stacked";

const JourneyModeContext = createContext<JourneyMode>("film");

export function JourneyModeProvider({
  mode,
  children,
}: {
  mode: JourneyMode;
  children: ReactNode;
}) {
  return <JourneyModeContext.Provider value={mode}>{children}</JourneyModeContext.Provider>;
}

const EASE = "cubic-bezier(.2,.7,.2,1)";

// One reveal item inside a journey copy layer. In film mode the scroll engine
// finds these by the data-r attribute and drives opacity/transform/filter
// imperatively — the inline styles are only the authored hidden state it
// starts from. `baseTransform` carries any layout transform the item needs
// beyond the reveal offset (e.g. the centred scroll cue's translateX(-50%));
// the engine strips the translateY and restores that base, never `none`.
// In stacked mode items render plainly visible.

interface RevealItemProps {
  children: ReactNode;
  className?: string;
  // Reveal duration in seconds; hero and final CTA use 1s, everything else 0.9s.
  duration?: number;
  baseTransform?: string;
  style?: CSSProperties;
}

export function RevealItem({
  children,
  className,
  duration = 0.9,
  baseTransform = "",
  style,
}: RevealItemProps) {
  const mode = useContext(JourneyModeContext);
  if (mode === "stacked") {
    return (
      <div className={className} style={{ transform: baseTransform || undefined, ...style }}>
        {children}
      </div>
    );
  }
  const t = `opacity ${duration}s ${EASE}, transform ${duration}s ${EASE}, filter ${duration}s ${EASE}`;
  return (
    <div
      data-r=""
      className={className}
      style={{
        opacity: 0,
        transform: `${baseTransform} translateY(26px)`.trim(),
        filter: "blur(8px)",
        transition: t,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// The wrapper every copy layer renders. Film mode: a fixed-stage viewport
// layer, hidden until the engine paints it; interactive children re-enable
// pointer-events on their own wrapper. Stacked mode: a full-height section
// with the waypoint's still behind a contrast gradient, scrolling normally —
// `anchorId` gives the classic in-page anchors their targets.
interface CopyLayerProps {
  index: number;
  children: ReactNode;
  className?: string;
  anchorId?: string;
}

export function CopyLayer({ index, children, className, anchorId }: CopyLayerProps) {
  const mode = useContext(JourneyModeContext);
  if (mode === "stacked") {
    return (
      <section id={anchorId} className="relative overflow-hidden bg-black">
        {/* Decorative still; plain img so remote hosts never matter. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={FILM[index].still}
          alt=""
          aria-hidden="true"
          loading={index > 0 ? "lazy" : undefined}
          className="absolute inset-0 h-full w-full object-cover opacity-70"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/75 via-black/50 to-black/80" />
        <div className={`relative flex min-h-[100svh] flex-col justify-center ${className ?? ""}`}>
          {children}
        </div>
      </section>
    );
  }
  return (
    <div
      data-cp={index}
      className={`absolute inset-0 flex flex-col justify-center will-change-[opacity] ${className ?? ""}`}
      style={{ opacity: 0, visibility: "hidden" }}
    >
      {children}
    </div>
  );
}
