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
    const observer = new ResizeObserver(update);
    observer.observe(node);
    node.addEventListener("scroll", update, { passive: true });
    return () => {
      observer.disconnect();
      node.removeEventListener("scroll", update);
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
        className={`group/sport relative flex h-[100px] min-w-[90px] shrink-0 flex-col items-center justify-center rounded-md px-2 py-12 transition-colors md:h-[140px] md:min-w-[120px] ${selected ? "bg-[#171717]" : "hover:bg-[#171717]"}`}
      >
        <span
          className={`absolute top-2 left-1/2 flex h-[1.2rem] min-w-[1.2rem] -translate-x-1/2 items-center justify-center text-[10px] md:top-3 ${selected ? "text-white" : "text-[#999]"}`}
        >
          {count}
        </span>
        <SportIcon
          sport={entry.sport.slug}
          name={entry.sport.name}
          className="h-[40px] w-auto transition-all md:h-[60px]"
        />
        <span
          className={`absolute bottom-2 px-1 text-[10px] whitespace-nowrap md:bottom-3.5 md:text-xs ${selected ? "text-white opacity-100" : "text-[#999] opacity-0 group-hover/sport:opacity-100"}`}
        >
          {entry.sport.name}
        </span>
      </Link>
    );
  }

  return (
    <div className="mx-auto py-2">
      <div className="group relative mx-auto flex h-auto max-w-[1440px] items-center overflow-hidden">
        <button
          type="button"
          onClick={() => scroll("left")}
          aria-label="Scroll left"
          className={`absolute left-0 z-10 hidden h-full w-14 shrink-0 cursor-pointer items-center justify-start p-0.5 text-[#7e7e7e] opacity-0 transition-opacity duration-300 group-hover:opacity-100 hover:text-white md:flex ${canScrollLeft ? "visible" : "invisible"}`}
        >
          <span className="rounded-md bg-[#2e2e2e] p-1.5 shadow-lg transition-all duration-300 hover:scale-110 hover:bg-[#2e2e2e]">
            <Chevron direction="left" />
          </span>
        </button>

        <div
          ref={scroller}
          className="flex [scrollbar-width:none] items-center gap-1 overflow-x-auto overscroll-x-contain scroll-smooth px-0 xl:overflow-x-hidden"
        >
          {regular.map(tile)}
          {regular.length && esports.length ? (
            <div className="mx-0 flex h-[70px] flex-col items-center justify-center md:h-[140px]">
              <div className="h-[40px] w-px rounded-full bg-[#7e7e7e] md:h-[80px]" />
            </div>
          ) : null}
          {esports.map(tile)}
        </div>

        <button
          type="button"
          onClick={() => scroll("right")}
          aria-label="Scroll right"
          className={`absolute right-0 z-10 hidden h-full w-14 shrink-0 cursor-pointer items-center justify-end p-0.5 text-[#7e7e7e] opacity-0 transition-opacity duration-300 group-hover:opacity-100 hover:text-white md:flex ${canScrollRight ? "visible" : "invisible"}`}
        >
          <span className="rounded-md bg-[#2e2e2e] p-1.5 shadow-lg transition-all duration-300 hover:scale-110 hover:bg-[#2e2e2e]">
            <Chevron direction="right" />
          </span>
        </button>
      </div>
    </div>
  );
}
