"use client";

import { useEffect } from "react";

// A global click feedback in the magicui RippleButton style: a light-purple
// circle expands and fades from the click point on any button. One
// document-level listener rather than a wrapper per button, so it reaches every
// clickable in the app without touching their markup. The ripple lives in an
// injected layer clipped to the button's own rounded rect, so nothing about the
// button's own overflow or layout changes.
//
// Opt a control out with `data-no-ripple`.

const RIPPLE_MS = 600;
// Light purple, per the product owner (magicui's demo used #ADD8E6).
const RIPPLE_COLOR = "#c4b5fd";

function targetButton(node: EventTarget | null): HTMLElement | null {
  if (!(node instanceof Element)) return null;
  const el = node.closest<HTMLElement>('button, [role="button"], a');
  if (!el) return null;
  if (el.hasAttribute("data-no-ripple")) return null;
  if (el instanceof HTMLButtonElement && el.disabled) return null;
  if (el.getAttribute("aria-disabled") === "true") return null;
  return el;
}

function spawnRipple(el: HTMLElement, clientX: number, clientY: number): void {
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return;

  // The layer clips the ripple to the button's rounded rectangle without
  // needing to change the button's own overflow.
  const layer = document.createElement("span");
  layer.className = "ws-ripple-layer";

  // magicui geometry: a circle of the button's larger dimension, positioned so
  // its own centre sits at the click point, scaled from 0 to 2.
  const size = Math.max(rect.width, rect.height);
  const ripple = document.createElement("span");
  ripple.className = "ws-ripple";
  ripple.style.width = `${size}px`;
  ripple.style.height = `${size}px`;
  ripple.style.left = `${clientX - rect.left - size / 2}px`;
  ripple.style.top = `${clientY - rect.top - size / 2}px`;
  ripple.style.backgroundColor = RIPPLE_COLOR;

  layer.appendChild(ripple);

  // The layer is absolutely positioned, so the button must be a positioning
  // context. Setting it is harmless and only done when it is still static.
  if (getComputedStyle(el).position === "static") el.style.position = "relative";

  el.appendChild(layer);
  window.setTimeout(() => layer.remove(), RIPPLE_MS);
}

export function ClickRipple() {
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      // Primary button / touch / pen only; ignore right and middle clicks.
      if (event.button !== 0) return;
      const el = targetButton(event.target);
      if (!el) return;
      spawnRipple(el, event.clientX, event.clientY);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, []);

  return null;
}
