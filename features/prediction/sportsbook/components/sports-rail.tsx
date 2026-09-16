"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { SportNavigation, SportsbookEventKind, SportsbookGameState } from "../api";
import { SportIcon } from "./sport-icon";

const ESPORTS = new Set([
  "lol",
  "league-of-legends",
  "dota-2",
  "dota2",
  "cs2",
  "counter-strike",
  "counter-strike-2",
]);

function eventCount(entry: SportNavigation, state: SportsbookGameState): number {
  if (state === "live") return entry.liveGames;
  if (state === "prematch") return entry.prematchGames;
  return entry.activeGames;
}

function sportHref(
  sport: string,
  state: SportsbookGameState,
  eventKind: SportsbookEventKind
): string {
  const query = new URLSearchParams({ sport, state });
  if (eventKind !== "sports") query.set("kind", eventKind);
  return `/prediction/markets?${query}`;
}

function Chevron({ direction }: { direction: "left" | "right" }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="size-6 fill-current">
      {direction === "left" ? (
        <path d="M9.807 4.473a.664.664 0 0 0-.94 0l-3.06 3.06c-.26.26-.26.68 0 .94l3.06 3.06a.664.664 0 1 0 .94-.94L7.22 8l2.587-2.587a.67.67 0 0 0 0-.94Z" />
      ) : (
        <path d="M6.194 4.473c-.26.26-.26.68 0 .94L8.78 8l-2.586 2.587a.664.664 0 1 0 .94.94l3.06-3.06c.26-.26.26-.68 0-.94l-3.06-3.06a.67.67 0 0 0-.94.006Z" />
      )}
    </svg>
  );
}

export function SportsRail({
  sports,
  activeSport,
  state,
  eventKind,
}: {
  sports: SportNavigation[];
  activeSport: string;
  state: SportsbookGameState;
  eventKind: SportsbookEventKind;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const ordered = [...sports]
    .filter((entry) => eventCount(entry, state) > 0)
    .sort((left, right) => {
      const countDifference = eventCount(right, state) - eventCount(left, state);
      if (countDifference !== 0) return countDifference;
      if (left.sport.slug === "football") return -1;
      if (right.sport.slug === "football") return 1;
      return left.sport.name.localeCompare(right.sport.name);
    });
  const regular = ordered.filter((entry) => !ESPORTS.has(entry.sport.slug));
  const esports = ordered.filter((entry) => ESPORTS.has(entry.sport.slug));

  useEffect(() => {
    const node = scroller.current;
    if (!node) return;

    const update = () => {
      setCanScrollLeft(node.scrollLeft > 2);
      setCanScrollRight(node.scrollLeft + node.clientWidth < node.scrollWidth - 2);
    };
    update();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(node);
    node.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      observer?.disconnect();
      node.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [ordered.length]);

  function scroll(direction: "left" | "right") {
    scroller.current?.scrollBy({
      left: direction === "left" ? -720 : 720,
      behavior: "smooth",
    });
  }

  function tile(entry: SportNavigation) {
    const selected = entry.sport.slug === activeSport;
    const count = eventCount(entry, state);
    return (
      <Link
        key={entry.sport.id}
        href={sportHref(entry.sport.slug, state, eventKind)}
        aria-label={`${entry.sport.name}, ${count} events`}
        aria-current={selected ? "page" : undefined}
        className={`inline-flex h-8 shrink-0 items-center gap-2 rounded-md px-3 text-[13px] font-semibold whitespace-nowrap transition-colors ${selected ? "bg-[#172235] text-[#5ba8ff]" : "text-[#858b96] hover:bg-white/[0.05] hover:text-white"}`}
      >
        <SportIcon sport={entry.sport.slug} name={entry.sport.name} className="size-4 shrink-0" />
        <span>{entry.sport.name}</span>
        <span
          className={`text-[11px] tabular-nums ${selected ? "text-[#8dc3ff]" : "text-[#5f6570]"}`}
        >
          {count}
        </span>
      </Link>
    );
  }

  return (
    <div className="w-full border-y border-white/[0.07] bg-black">
      <div className="group relative mx-auto flex h-12 max-w-[1350px] items-center overflow-hidden px-4 lg:px-6">
        <button
          type="button"
          onClick={() => scroll("left")}
          aria-label="Scroll left"
          className={`absolute top-0 bottom-0 left-0 z-10 w-10 cursor-pointer bg-gradient-to-r from-black via-black to-transparent text-white ${canScrollLeft ? "grid place-items-center" : "hidden"}`}
        >
          <Chevron direction="left" />
        </button>

        <div
          ref={scroller}
          className="flex h-full flex-1 touch-pan-x [scrollbar-width:none] items-center gap-1 overflow-x-auto overscroll-x-contain scroll-smooth [&::-webkit-scrollbar]:hidden"
        >
          {regular.map(tile)}
          {regular.length && esports.length ? (
            <span aria-hidden="true" className="mx-2 h-4 w-px shrink-0 bg-white/15" />
          ) : null}
          {esports.map(tile)}
        </div>

        <button
          type="button"
          onClick={() => scroll("right")}
          aria-label="Scroll right"
          className={`absolute top-0 right-0 bottom-0 z-10 w-10 cursor-pointer bg-gradient-to-l from-black via-black to-transparent text-white ${canScrollRight ? "grid place-items-center" : "hidden"}`}
        >
          <Chevron direction="right" />
        </button>
      </div>
    </div>
  );
}
