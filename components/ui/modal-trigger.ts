"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

/**
 * Marks the ModalShell panel that a `useModalTrigger` focus trap belongs to.
 *
 * The shell owns its own chrome, the close button included, and renders our
 * content one level deeper. Tagging the panel through the shell's public
 * `panelClassName` prop lets the trap find the whole dialog, so Tab reaches
 * the close button instead of cycling only the content we passed in. The class
 * carries no styles; it exists to be found.
 *
 * The name still says "meme" because that is where this started. Nothing but
 * this module reads the literal, so a rename is safe but is not this change.
 */
export const MODAL_PANEL_CLASS = "ws-meme-modal";

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]",
].join(",");

/**
 * The elements Tab visits inside the dialog, in document order.
 *
 * The tabIndex check is the load-bearing part: the sort menu parks every item
 * but the current one at -1, so the whole menu is one stop and the arrow keys
 * move within it. Matching on the tag alone would put all eight metrics in the
 * cycle.
 */
function tabStops(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.tabIndex >= 0);
}

/**
 * Escape and the Tab cycle for an open dialog, with no opinion about who owns
 * the open state.
 *
 * `useModalTrigger` below owns its own, which suits a toolbar button that opens
 * a menu. A dialog whose subject comes from its caller — the Activity detail
 * sheet takes the item to show as a prop, and is closed by that prop going
 * null — cannot use that state without syncing two copies of it, so the
 * keyboard half lives here and both shapes share one implementation. This is
 * the only copy of the trap in the tree and it stays that way.
 *
 * `panelRef` goes on the dialog element inside the shell. The trap works from
 * the marked shell panel when there is one, so the shell's close button counts
 * as a stop, and falls back to the dialog itself otherwise.
 *
 * Pass `open: false` to stand down: a caller that has put a second dialog on
 * top of this one hands the keyboard to whatever is in front, rather than
 * trapping Tab in the surface underneath.
 */
export function useModalDismiss(
  open: boolean,
  onDismiss: () => void,
  panelRef: RefObject<HTMLDivElement | null>
): void {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        onDismiss();
        return;
      }
      if (e.key !== "Tab") return;
      const dialog = panelRef.current;
      if (dialog === null) return;
      const trap = dialog.closest<HTMLElement>(`.${MODAL_PANEL_CLASS}`) ?? dialog;
      const stops = tabStops(trap);
      if (stops.length === 0) {
        e.preventDefault();
        return;
      }
      const first = stops[0];
      const last = stops[stops.length - 1];
      const active = document.activeElement;
      const inside = active instanceof Node && trap.contains(active);
      if (!inside) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      } else if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onDismiss, panelRef]);
}

/**
 * Open state for a toolbar modal. Escape closes it and hands focus back to the
 * trigger, and Tab cycles inside the dialog rather than walking out into the
 * page behind it. A press on the backdrop is the shell's job, and the caller
 * decides whether that returns focus.
 */
export function useModalTrigger() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const refocus = useRef(false);

  const close = useCallback((returnFocus: boolean) => {
    refocus.current = returnFocus;
    setOpen(false);
  }, []);

  const dismiss = useCallback(() => close(true), [close]);
  useModalDismiss(open, dismiss, panelRef);

  // Focus goes back to the trigger when the modal was dismissed from inside
  // it — Escape, or a pick — and stays put when the trigger itself closed it.
  useEffect(() => {
    if (open || !refocus.current) return;
    refocus.current = false;
    triggerRef.current?.focus();
  }, [open]);

  return { open, show: () => setOpen(true), close, triggerRef, panelRef };
}
