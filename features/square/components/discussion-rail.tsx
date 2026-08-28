"use client";

import { useCallback, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { formatCompact } from "@/lib/square/format-count";
import type { TrendingDiscussion } from "@/lib/api/market-square";

/**
 * Trending discussions, as a swipeable rail.
 *
 * A vertical list made every discussion equal and pushed the rest of the sheet
 * down; a rail keeps the busiest one in view, admits the others cost nothing
 * to reach, and takes one row of height however many there are. Discussions
 * are also perishable — the window is 48 hours — so this is a glance-and-tap
 * surface rather than something to read down.
 *
 * Scroll-snap does the paging, so it is a real scroller: it works with a
 * trackpad, a touch swipe, a shift-wheel and the keyboard, and it does not
 * fight the browser the way a JS-driven carousel does. The dots report
 * position rather than driving it.
 */
export function DiscussionRail({
  discussions,
  onOpen,
}: {
  discussions: TrendingDiscussion[];
  onOpen: (tag: string) => void;
}) {
  const t = useTranslations("square");
  const trackRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  // Position from scroll offset rather than an IntersectionObserver per card:
  // there are a handful of cards, and this stays exact while a swipe is still
  // settling instead of snapping the dot late.
  const onScroll = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    const card = track.scrollWidth / Math.max(discussions.length, 1);
    setActive(Math.round(track.scrollLeft / Math.max(card, 1)));
  }, [discussions.length]);

  if (discussions.length === 0) return null;

  return (
    <div>
      <div
        ref={trackRef}
        onScroll={onScroll}
        // Bleeds to the sheet's edges (it pads by 26px) so the next card peeks off
        // the side and reads as "swipe for more" rather than as a clipped card.
        className="ws-no-scrollbar -mx-[26px] flex snap-x snap-mandatory gap-2 overflow-x-auto px-[26px] pb-1"
      >
        {discussions.map((discussion) => (
          <button
            key={discussion.tag}
            type="button"
            onClick={() => onOpen(discussion.tag)}
            className="ws-inset w-[248px] shrink-0 snap-start p-3.5 text-left transition-colors hover:bg-white/5"
          >
            <span className="block truncate text-[14px] font-semibold text-white">
              {discussion.label}
            </span>

            {/* Participants and reach are DIFFERENT things and read as such:
                "12 discussing" is people, "80.8K views" is how far it has
                travelled. Never merged into one number. */}
            <span className="text-grey-500 mt-1 block text-[12px]">
              {t("discussing", { count: discussion.participantCount })}
              {discussion.viewCount ? ` · ${t("viewsCount", { count: discussion.viewCount })}` : ""}
            </span>

            <span className="text-accent mt-2.5 block text-[12.5px] font-semibold">
              {t("joinDiscussion")}
            </span>
          </button>
        ))}
      </div>

      {/* Position, not navigation — the rail is already swipeable, and dots
          large enough to tap would be a second control for the same job. They
          are hidden from assistive tech for that reason. */}
      {discussions.length > 1 ? (
        <div className="mt-2 flex justify-center gap-1.5" aria-hidden>
          {discussions.map((discussion, index) => (
            <span
              key={discussion.tag}
              className={
                "h-1 rounded-full transition-all " +
                (index === active ? "bg-accent w-4" : "bg-grey-700 w-1.5")
              }
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
