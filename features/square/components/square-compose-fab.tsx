"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { squareLinks } from "@/lib/square/links";
import { SquareComposer } from "@/components/share/square-composer";
import { SquareActionsSheet } from "@/features/square/components/square-actions-sheet";
import type { TradableSymbol } from "@/lib/square/tradable";

/** How far down the page the square section starts mattering, in viewports. */
const REVEAL_AFTER_VIEWPORTS = 1.2;

/**
 * Compose, revealed once the player has scrolled into social territory.
 *
 * It is hidden at the top of the dashboard on purpose. Someone who has just
 * opened Ark is there to see their portfolio, and a permanent "post something"
 * button over that is the app talking about itself. Once they have scrolled
 * past a screenful the reading has become browsing, and an invitation to join
 * in is welcome rather than in the way.
 *
 * Positioned above the safe-area inset so it clears the home indicator on a
 * phone, and it never sits over the sticky header because it is anchored to
 * the bottom.
 */
export function SquareComposeFab({
  markets = [],
  onPickTopic,
  onPickDiscussion,
}: {
  markets?: TradableSymbol[];
  /** Lets the sheet's topics and discussions steer the feed's tab strip. */
  onPickTopic?: (key: string) => void;
  onPickDiscussion?: (tag: string) => void;
}) {
  const t = useTranslations("square");
  const [shown, setShown] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [composing, setComposing] = useState<false | "text" | "media">(false);
  // Only the square being CONFIGURED matters now; the composer is local, so
  // there is no compose URL to navigate to.
  const href = squareLinks.home();

  useEffect(() => {
    if (!href) return;
    // Passive, and coalesced to one frame: scroll fires far faster than the
    // screen repaints, and setting state on every event would re-render the
    // page dozens of times a second for a boolean that changes twice.
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        setShown(window.scrollY > window.innerHeight * REVEAL_AFTER_VIEWPORTS);
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [href]);

  if (!href) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setSheetOpen(true)}
        aria-label={t("compose")}
        // Kept mounted and faded so it does not pop into the layout mid-scroll;
        // `pointer-events-none` while hidden keeps it from catching taps meant
        // for whatever is underneath it.
        className={
          // STACKED ABOVE the support button, which also owns this corner
          // (components/layout/support-button.tsx: right-4 bottom-[92px+inset],
          // md:right-6 md:bottom-6, a 52px disc plus a label ≈ 70px tall).
          // Sharing the corner without accounting for it put the two controls on
          // top of each other. Same right edge and the same 52px disc, so they
          // read as one column of controls rather than two strays.
          //
          // Ark's accent is silver on near-black (globals.css: "no purple, no
          // gold"), so this is the one bright surface rather than a colour
          // borrowed off another product.
          "fixed right-4 bottom-[calc(174px+env(safe-area-inset-bottom))] z-[79] grid " +
          "size-[52px] place-items-center rounded-full md:right-6 md:bottom-[106px] " +
          "bg-accent text-ink shadow-[0_14px_40px_-12px_rgba(0,0,0,0.85)] " +
          "transition-all duration-200 hover:scale-105 " +
          "focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 " +
          "focus-visible:ring-offset-black focus-visible:outline-none " +
          (shown ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0")
        }
      >
        <svg viewBox="0 0 24 24" aria-hidden className="h-5 w-5">
          <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>

      {/* The plus opens the square's entry sheet — who you are there, what is
          waiting, and the ways in — rather than assuming writing is the only
          reason anyone reaches for it. */}
      <SquareActionsSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onCompose={() => {
          setSheetOpen(false);
          setComposing("text");
        }}
        onComposeMedia={() => {
          setSheetOpen(false);
          setComposing("media");
        }}
        onPickTopic={onPickTopic}
        onPickDiscussion={onPickDiscussion}
      />

      {/* Composing happens HERE, in Ark, rather than on another deployment:
          posting is a write the proxy already relays. */}
      <SquareComposer
        open={composing !== false}
        onClose={() => setComposing(false)}
        markets={markets}
        withMedia={composing === "media"}
      />
    </>
  );
}
