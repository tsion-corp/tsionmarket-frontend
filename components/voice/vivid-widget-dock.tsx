"use client";

import { useEffect } from "react";
import { clampDock, dockFromDrag, isDrag, loadDock, saveDock } from "@/lib/voice/dock";

// Makes the Vivid widget's floating orb draggable.
//
// The orb belongs to the third-party widget loaded in app/layout. It renders
// into a CLOSED shadow root, so neither its element nor its styles are
// reachable: `host.shadowRoot` is null, page CSS cannot cross the boundary, and
// the widget exposes no custom properties to override. The launcher is
// `.wrap { position: fixed; right: 14px; bottom: 14px }` inside that root.
//
// What IS reachable is the host element, `<div data-vivid>`, and two standard
// browser behaviours make this work without touching the widget's internals:
//
//   A transformed element becomes the containing block for `position: fixed`
//   descendants. Giving the host a transform makes the orb's right/bottom
//   resolve against the host's box instead of the viewport, so moving the host
//   moves the orb. The host is kept zero-sized at the corner, which reproduces
//   the widget's own placement exactly and covers nothing.
//
//   Events inside a closed shadow root retarget to the host, so a pointer press
//   on the orb arrives here as a press on `[data-vivid]`.
//
// This depends on the vendor's markup: the `data-vivid` attribute and a fixed,
// bottom-right-anchored launcher. If either changes the effect is that the orb
// stops being draggable and keeps working normally, which is why every step
// below bails out quietly rather than throwing.
export function VividWidgetDock() {
  useEffect(() => {
    // The widget's own offsets, which stay applied inside the shadow root. The
    // host is positioned to cancel them out so the starting place is unchanged.
    const INNER_OFFSET = 14;
    const WIDGET_DEFAULT = { right: INNER_OFFSET, bottom: INNER_OFFSET };
    const viewport = () => ({ width: window.innerWidth, height: window.innerHeight });

    let host: HTMLElement | null = null;
    let position = clampDock(loadDock() ?? WIDGET_DEFAULT, viewport());
    let origin: { x: number; y: number; from: typeof position } | null = null;
    let moved = false;

    const apply = () => {
      if (!host) return;
      host.style.position = "fixed";
      host.style.width = "0";
      host.style.height = "0";
      host.style.right = `${position.right - INNER_OFFSET}px`;
      host.style.bottom = `${position.bottom - INNER_OFFSET}px`;
      // The whole point: this is what makes the host the containing block for
      // the orb. Without it the orb stays pinned to the viewport.
      host.style.transform = "translateZ(0)";
      host.style.cursor = moved ? "grabbing" : "grab";
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      moved = false;
      origin = { x: event.clientX, y: event.clientY, from: position };
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!origin) return;
      const dx = event.clientX - origin.x;
      const dy = event.clientY - origin.y;
      if (!moved && !isDrag(dx, dy)) return;
      moved = true;
      // Stops the page text-selecting and the touchscreen scrolling under the
      // finger while the orb is being moved.
      event.preventDefault();
      position = clampDock(dockFromDrag(origin.from, dx, dy), viewport());
      apply();
    };

    const onPointerUp = () => {
      if (!origin) return;
      origin = null;
      if (moved) {
        saveDock(position);
        apply();
      }
    };

    // A drag that ends on the orb still fires a click, which the widget would
    // read as "open Vivid". Swallowed in the capture phase so it never reaches
    // the widget's own listener inside the shadow root. A real tap is left
    // alone, so the orb still opens normally.
    const onClickCapture = (event: MouseEvent) => {
      if (!moved) return;
      moved = false;
      event.stopPropagation();
      event.preventDefault();
    };

    const onResize = () => {
      position = clampDock(position, viewport());
      apply();
    };

    const attach = (element: HTMLElement) => {
      host = element;
      apply();
      element.addEventListener("pointerdown", onPointerDown);
      element.addEventListener("click", onClickCapture, true);
      window.addEventListener("pointermove", onPointerMove, { passive: false });
      window.addEventListener("pointerup", onPointerUp);
      window.addEventListener("pointercancel", onPointerUp);
      window.addEventListener("resize", onResize);
      window.addEventListener("orientationchange", onResize);
    };

    const existing = document.querySelector<HTMLElement>("[data-vivid]");
    if (existing) {
      attach(existing);
    }

    // The widget script is loaded afterInteractive and mounts whenever it is
    // ready, so the host usually does not exist yet on this effect's first run.
    const observer = existing
      ? null
      : new MutationObserver(() => {
          const found = document.querySelector<HTMLElement>("[data-vivid]");
          if (!found) return;
          observer?.disconnect();
          attach(found);
        });
    observer?.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer?.disconnect();
      host?.removeEventListener("pointerdown", onPointerDown);
      host?.removeEventListener("click", onClickCapture, true);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, []);

  return null;
}
