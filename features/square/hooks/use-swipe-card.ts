"use client";

import { useCallback, useRef, useState } from "react";
import {
  COMMIT_RATIO,
  exitOffset,
  isHorizontalGesture,
  swipeDecision,
  swipeProgress,
  swipeRotation,
  type SwipeDecision,
} from "@/lib/square/deck";

/**
 * The deck's swipe, carried over verbatim from the Square
 * (market-square-frontend/hooks/use-swipe-card.ts): a sideways drag on the
 * front card that claims the pointer once it is clearly horizontal, follows
 * the finger, and on release either springs back or flies out and decides.
 */
export function useSwipeCard({
  width,
  onDecide,
  canCommit,
  disabled = false,
  settleMs = 180,
}: {
  width: number;
  onDecide: (decision: Exclude<SwipeDecision, null>) => void;
  canCommit?: (decision: Exclude<SwipeDecision, null>) => boolean;
  disabled?: boolean;
  settleMs?: number;
}) {
  const [dx, setDx] = useState(0);
  const [dy, setDy] = useState(0);
  const [committing, setCommitting] = useState<SwipeDecision>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const last = useRef<{ x: number; t: number } | null>(null);
  const claimed = useRef(false);

  const release = useCallback(() => {
    setDx(0);
    setDy(0);
    claimed.current = false;
    start.current = null;
  }, []);

  const onPointerDown = useCallback(
    (event: React.PointerEvent) => {
      if (disabled || committing) return;
      start.current = { x: event.clientX, y: event.clientY };
      last.current = { x: event.clientX, t: event.timeStamp };
    },
    [committing, disabled]
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent) => {
      const from = start.current;
      if (!from || committing) return;
      const nextDx = event.clientX - from.x;
      const nextDy = event.clientY - from.y;
      if (!claimed.current) {
        if (!isHorizontalGesture(nextDx, nextDy)) {
          if (Math.abs(nextDy) > 12) start.current = null;
          return;
        }
        claimed.current = true;
        event.currentTarget.setPointerCapture?.(event.pointerId);
      }
      last.current = { x: event.clientX, t: event.timeStamp };
      setDx(nextDx);
      setDy(nextDy);
    },
    [committing]
  );

  const onPointerUp = useCallback(
    (event: React.PointerEvent) => {
      const from = start.current;
      if (!from || committing) return release();
      const prev = last.current;
      const elapsed = Math.max(1, event.timeStamp - (prev?.t ?? event.timeStamp));
      const velocity = (event.clientX - (prev?.x ?? event.clientX)) / elapsed;
      const decision = swipeDecision({ dx, dy, width, velocity });
      if (!decision) return release();
      if (canCommit && !canCommit(decision)) return release();
      setCommitting(decision);
      start.current = null;
      claimed.current = false;
      window.setTimeout(() => {
        setCommitting(null);
        setDx(0);
        setDy(0);
        onDecide(decision);
      }, settleMs);
    },
    [canCommit, committing, dx, dy, onDecide, release, settleMs, width]
  );

  const offset = committing ? exitOffset(committing, width) : dx;
  const progress = swipeProgress(dx, width);
  return {
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp },
    transform: `translateX(${offset}px) rotate(${swipeRotation(offset, width)}deg)`,
    dragging: claimed.current && !committing,
    committing,
    progress,
    verdict: Math.min(1, Math.abs(progress) / COMMIT_RATIO),
  };
}
