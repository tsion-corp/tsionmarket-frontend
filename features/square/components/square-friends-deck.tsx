"use client";

import { useCallback, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { SQUARE_DECK_NODE, deckLayout, type DeckLayout } from "@/lib/square/deck";
import type { SuggestedProfile } from "@/lib/api/market-square";
import { useSwipeCard } from "@/features/square/hooks/use-swipe-card";
import { IconDeckArrow } from "@/features/square/components/square-deck-icons";
import { SquareDeckDots } from "@/features/square/components/square-deck-dots";
import { SquarePalCard } from "@/features/square/components/square-pal-card";

const FALLBACK_ROOM = 552;
const HOME_DOTS = { dx: 5.61, width: 36.29 + 4 * 13.79 + 4 * 3.63 };

/**
 * Home's people deck, the Square's own carried over
 * (market-square-frontend/components/layout/friends-deck.tsx, node
 * 647:16300), with the maintainer's change of 2026-09-12: the front card
 * with one fanned behind it on each side, the next one blurred so the next
 * person cannot be made out and the previous one dim as Home draws it, the
 * left glass disc to go back, no right disc, and the five pills under it. The fan is tighter than Home's, so the front card is
 * larger. The whole fan is drawn in the file's units and scaled by one `k`
 * to the column it measures for itself, so nothing is ever cut.
 *
 * On Home the swipe is navigation, as it is on the Square's Home: right goes
 * back, left goes on, and the ends spring back. Nothing a drag does touches
 * the service; following is the badge on the card.
 */
export function SquareFriendsDeck({ people }: { people: SuggestedProfile[] }) {
  const t = useTranslations("square");
  const [index, setIndex] = useState(0);

  // Measured, not assumed at a breakpoint: the column depends on the shell's
  // cap and the rail. A callback ref fires when the node arrives.
  const [room, setRoom] = useState(0);
  const observer = useRef<ResizeObserver | null>(null);
  const fitRef = useCallback((el: HTMLElement | null) => {
    observer.current?.disconnect();
    observer.current = null;
    if (!el || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      if (el.clientWidth > 0) setRoom(el.clientWidth);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    observer.current = ro;
  }, []);

  const node = SQUARE_DECK_NODE;
  const layout = deckLayout({ room: room || FALLBACK_ROOM, arrows: true, node });
  const items = people;

  const canStep = (delta: number) => {
    const next = index + delta;
    return next >= 0 && next < items.length;
  };
  const step = (delta: number) => {
    if (!canStep(delta)) return;
    setIndex(index + delta);
  };

  const shown = [index - 1, index, index + 1].filter((i) => items[i]);
  // With only two people left the spare one takes the right slot, so there
  // is always visibly somebody after this one.
  const slotOf = (position: number) => {
    const slot = position - index;
    const spareOnLeftOnly =
      shown.length === 2 && shown.includes(index - 1) && !shown.includes(index + 1);
    return spareOnLeftOnly && slot === -1 ? 1 : slot;
  };
  const arrowSize = node.arrow.size * layout.k;

  return (
    // Capped at Home's 600: the fan is drawn to that column in the file, and
    // measuring a wider one would scale every card past it.
    <div ref={fitRef} className="mx-auto flex w-full max-w-[600px] flex-col">
      {/* `isolate` keeps the fan's layers its own business, so a popover on
          the page above it paints over the whole fan by the spec. */}
      <div
        className="relative isolate mt-[90px] w-full overflow-x-clip"
        style={{ height: layout.height }}
      >
        {shown.map((position) => (
          <DeckCard
            key={items[position].id}
            person={items[position]}
            slot={slotOf(position)}
            layout={layout}
            canStep={canStep}
            onStep={step}
          />
        ))}
        <DeckArrow
          direction="prev"
          label={t("prevPerson")}
          disabled={!canStep(-1)}
          onClick={() => step(-1)}
          size={arrowSize}
          left={layout.frontX + (node.arrow.leftDx - node.arrow.size / 2) * layout.k}
          top={layout.frontY + (node.arrow.dy - node.arrow.size / 2) * layout.k}
        />
        {/* No right disc: going on is the card's pass, or a swipe left. */}
      </div>

      {items.length > 1 ? (
        <div
          className="mt-[9.38px]"
          style={{
            paddingLeft: Math.max(0, layout.frontX + HOME_DOTS.dx * layout.k - HOME_DOTS.width / 2),
          }}
        >
          <SquareDeckDots
            count={5}
            active={Math.round((index / (items.length - 1)) * 4)}
            className="justify-start"
          />
        </div>
      ) : null}
    </div>
  );
}

// The `<` `>` discs, nodes 844:22642 and 844:22639: not a mirrored pair. The
// left is black at 20% with a #979797 chevron, the right white at 16% with a
// white chevron. An inert disc keeps its strength and is a real `disabled`.
function DeckArrow({
  direction,
  label,
  disabled,
  onClick,
  size,
  left,
  top,
}: {
  direction: "prev" | "next";
  label: string;
  disabled: boolean;
  onClick: () => void;
  size: number;
  left: number;
  top: number;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={label}
      className={cn(
        "ws-pressable absolute z-30 flex items-center justify-center rounded-full shadow-[inset_0_1px_0_rgba(255,255,255,0.22),inset_0_0_0_1px_rgba(255,255,255,0.08)] backdrop-blur-md transition-opacity disabled:cursor-default disabled:opacity-70",
        direction === "prev" ? "bg-black/20 text-[#979797]" : "bg-white/16 text-white"
      )}
      style={{ width: size, height: size, left, top }}
    >
      <IconDeckArrow
        className={cn("shrink-0", direction === "next" && "-scale-x-100")}
        style={{ width: size * 0.375, height: size * 0.375 }}
      />
    </button>
  );
}

function DeckCard({
  person,
  slot,
  layout,
  canStep,
  onStep,
}: {
  person: SuggestedProfile;
  slot: number;
  layout: DeckLayout;
  canStep: (delta: number) => boolean;
  onStep: (delta: number) => void;
}) {
  const node = SQUARE_DECK_NODE;
  const front = slot === 0;
  const place = node.places[slot] ?? node.places[0];
  const { k } = layout;

  // Navigation, not a decision: right is back, left is on, and the ends
  // spring back rather than fly.
  const swipe = useSwipeCard({
    width: node.card.width * k,
    disabled: !front,
    canCommit: (decision) => canStep(decision === "follow" ? -1 : 1),
    onDecide: (decision) => onStep(decision === "follow" ? -1 : 1),
  });

  return (
    <div
      aria-hidden={!front}
      {...(front ? swipe.handlers : {})}
      className={cn(
        "absolute origin-center",
        front && "touch-pan-y select-none",
        swipe.dragging
          ? "transition-none"
          : "transition-[transform,opacity] duration-300 motion-reduce:transition-none",
        // The next card is blurred so who is next stays a surprise; the
        // previous one stays as Home draws it, dim and unblurred.
        front ? "z-20" : "z-10",
        slot === 1 && "blur-[7px]"
      )}
      style={{
        left: layout.frontX - node.card.width / 2,
        top: layout.frontY - node.card.height / 2,
        transform: `${front ? swipe.transform : ""} translate(${place.dx * k}px, ${place.dy * k}px) rotate(${place.rot}deg) scale(${place.scale * k})`,
        opacity: swipe.committing ? 0 : place.opacity,
      }}
    >
      <SquarePalCard
        person={person}
        interactive={front}
        onPass={() => onStep(1)}
        onFollowed={() => onStep(1)}
      />
    </div>
  );
}
