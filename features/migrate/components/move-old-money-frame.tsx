"use client";

import { createPortal } from "react-dom";
import { CloseIcon } from "@/components/ui/icons";

/*
  ITS OWN FILE, AND A LIGHT ONE. The sheet's module pulls in the panel and
  the old provider's SDK, which is why the sheet loads behind next/dynamic.
  A loading state drawn while that chunk downloads has to be importable
  WITHOUT dragging the chunk in — so the chrome lives here, with nothing
  heavier than a portal and a close icon.
*/
// The chrome around the migration panel: a full-height sheet above every
// other modal (the Account modal opens it from underneath), in a portal so
// it escapes whatever scroll container mounted it.
export function MoveOldMoneyFrame({
  onClose,
  children,
  dismissible = true,
}: {
  onClose: () => void;
  children: React.ReactNode;
  /**
   * When true the close button is the ONE way out — not the backdrop, not
   * Escape. A tap beside the card while a sweep is being signed, or while the
   * old sign-in is half done, must not put the card away by accident; leaving
   * is a deliberate press on the button. False turns the sheet into a gate
   * with no close button at all: the only way out is whatever `children`
   * offer — the migration gate uses this to hold the app until the old
   * account is linked and its money has moved.
   */
  dismissible?: boolean;
}) {
  return createPortal(
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-[440]">
      <div aria-hidden="true" className="absolute inset-0 bg-black/70 backdrop-blur-[7px]" />
      <div className="pointer-events-none absolute inset-0 flex items-end justify-center md:items-center md:p-6">
        {/* The beam lives on a wrapper that does NOT scroll. On the card itself
            it would be positioned inside the scroll container and slide away
            with the content on a long review list. */}
        <div className="ws-beam-upgrade pointer-events-auto relative w-full rounded-t-[24px] md:w-[min(520px,100%)] md:rounded-[24px]">
          {/* No padding of its own: the header's art bleeds to the edges, and
              the body brings its own. Black, not the sheet grey — the art is
              drawn against black. */}
          <div className="relative max-h-[92vh] w-full overflow-y-auto rounded-t-[24px] border border-white/14 bg-black shadow-[inset_0_1px_0_rgba(255,255,255,0.15),0_-20px_90px_-30px_rgba(0,0,0,0.9)] md:rounded-[24px]">
            {dismissible ? (
              <button
                onClick={onClose}
                aria-label="Close"
                className="absolute top-[18px] right-[18px] z-[1] grid h-[30px] w-[30px] cursor-pointer place-items-center rounded-full border border-white/12 bg-white/6 text-white/70"
              >
                <CloseIcon />
              </button>
            ) : null}
            {/* Positioned, so it paints above the glow rather than under it. */}
            <div className="relative">{children}</div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
