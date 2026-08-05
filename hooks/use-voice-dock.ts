"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Read at call time, never during module load: the hook runs on the server too,
// where there is no window.
const viewport = () => ({ width: window.innerWidth, height: window.innerHeight });
import {
  DEFAULT_DOCK,
  clampDock,
  dockFromDrag,
  isDrag,
  loadDock,
  saveDock,
  type DockPosition,
} from "@/lib/voice/dock";

// Makes the floating voice control draggable, and remembers where it was put.
//
// Pointer events rather than mouse/touch pairs, so one code path covers mouse,
// touch and pen. The pointer is captured on the control, so a fast drag that
// outruns the cursor keeps tracking instead of dropping the gesture the moment
// it leaves the element.
export function useVoiceDock() {
  // Read from storage in the initializer rather than an effect. That is safe
  // here despite touching the DOM: the control renders nothing until Privy is
  // ready and the user is signed in, which is never true during SSR or the
  // hydrating render, so there is no server markup for this to disagree with.
  const [position, setPosition] = useState<DockPosition>(() =>
    typeof window === "undefined" ? DEFAULT_DOCK : clampDock(loadDock() ?? DEFAULT_DOCK, viewport())
  );
  const [dragging, setDragging] = useState(false);

  // Where the pointer and the control were when the drag began.
  const originRef = useRef<{ x: number; y: number; dock: DockPosition } | null>(null);
  // Whether this gesture travelled far enough to be a move rather than a tap.
  // Read by the click handler to decide if the tap should open a session.
  const movedRef = useRef(false);

  // A position saved on a wide window can be off-screen on a phone, and a
  // rotate changes both axes at once. Re-clamp so the control is never stranded
  // somewhere it cannot be tapped.
  useEffect(() => {
    const onResize = () => setPosition((current) => clampDock(current, viewport()));
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, []);

  const onPointerDown = useCallback((event: React.PointerEvent<HTMLElement>) => {
    // Left button / primary contact only, so a right-click or a second finger
    // does not start a second drag.
    if (event.button !== 0) return;
    movedRef.current = false;
    setPosition((current) => {
      originRef.current = { x: event.clientX, y: event.clientY, dock: current };
      return current;
    });
    event.currentTarget.setPointerCapture(event.pointerId);
  }, []);

  const onPointerMove = useCallback((event: React.PointerEvent<HTMLElement>) => {
    const origin = originRef.current;
    if (!origin) return;
    const dx = event.clientX - origin.x;
    const dy = event.clientY - origin.y;
    if (!movedRef.current && !isDrag(dx, dy)) return;
    movedRef.current = true;
    setDragging(true);
    setPosition(clampDock(dockFromDrag(origin.dock, dx, dy), viewport()));
  }, []);

  const endDrag = useCallback((event: React.PointerEvent<HTMLElement>) => {
    if (!originRef.current) return;
    originRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (movedRef.current) {
      setDragging(false);
      setPosition((current) => {
        saveDock(current);
        return current;
      });
    }
  }, []);

  // True when the gesture that just ended was a drag, so the control can skip
  // the click it would otherwise fire. Reads and resets in one call: the click
  // always follows pointerup, and the flag must not survive into the next tap.
  const consumeDrag = useCallback((): boolean => {
    const moved = movedRef.current;
    movedRef.current = false;
    return moved;
  }, []);

  return {
    position,
    dragging,
    consumeDrag,
    // Spread onto the draggable element. touchAction none stops the browser
    // scrolling the page instead of moving the control on a touchscreen.
    dragHandlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
      style: { touchAction: "none" as const },
    },
  };
}
