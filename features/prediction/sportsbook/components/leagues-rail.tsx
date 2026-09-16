"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import type { CountryNavigation, SportsbookEventKind, SportsbookGameState } from "../api";
import { LeagueCountryFlag } from "./league-country-flag";

interface LeaguesRailProps {
  countries: CountryNavigation[];
  activeSport: string;
  activeSportName: string;
  activeCountry: string;
  activeLeague: string;
  state: SportsbookGameState;
  eventKind: SportsbookEventKind;
  onSearch: (value: string) => void;
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4" fill="none">
      <path
        d="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="m21 21-4.35-4.35"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Chevron({ direction }: { direction: "left" | "right" }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="size-4 fill-current">
      {direction === "left" ? (
        <path d="M9.807 4.473a.664.664 0 0 0-.94 0l-3.06 3.06c-.26.26-.26.68 0 .94l3.06 3.06a.664.664 0 1 0 .94-.94L7.22 8l2.587-2.587a.67.67 0 0 0 0-.94Z" />
      ) : (
        <path d="M6.194 4.473c-.26.26-.26.68 0 .94L8.78 8l-2.586 2.587a.664.664 0 1 0 .94.94l3.06-3.06c.26-.26.26-.68 0-.94l-3.06-3.06a.67.67 0 0 0-.94.006Z" />
      )}
    </svg>
  );
}

function leagueHref(
  sport: string,
  country: string,
  league: string,
  state: SportsbookGameState,
  eventKind: SportsbookEventKind
): string {
  const query = new URLSearchParams({ sport, state });
  if (country) query.set("country", country);
  if (league) query.set("league", league);
  if (eventKind !== "sports") query.set("kind", eventKind);
  return `/prediction/markets?${query}`;
}

function LeagueSearch({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div className="group/search relative flex h-8 w-[170px] min-w-[170px] shrink-0 items-center rounded-md border border-white/10 bg-black px-2 transition-colors focus-within:border-[#5ba8ff]/60">
      <span className="absolute top-1/2 left-2 -translate-y-1/2 text-[#646a75] transition-colors group-focus-within/search:text-[#5ba8ff]">
        <SearchIcon />
      </span>
      <label className="relative flex flex-1 items-center">
        <span className="sr-only">Filter leagues</span>
        <input
          type="text"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Filter leagues"
          className="w-full bg-transparent py-0 pr-5 pl-6 text-[13px] text-white outline-none placeholder:text-[#646a75]"
        />
        {value ? (
          <button
            type="button"
            onClick={() => onChange("")}
            aria-label="Clear league search"
            className="absolute right-0 grid size-5 cursor-pointer place-items-center text-[#646a75] hover:text-white"
          >
            <svg viewBox="0 0 16 16" aria-hidden="true" className="size-4 fill-none">
              <path
                d="m4 4 8 8m0-8-8 8"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
              />
            </svg>
          </button>
        ) : null}
      </label>
    </div>
  );
}

export function LeaguesRail({
  countries,
  activeSport,
  activeSportName,
  activeCountry,
  activeLeague,
  state,
  eventKind,
  onSearch,
}: LeaguesRailProps) {
  const router = useRouter();
  const scroller = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState("");
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const debouncedSearch = useDebouncedValue(search, 300).trim().toLowerCase();
  const leagues = countries
    .flatMap((country) =>
      country.leagues.map((league) => ({ ...league, country: country.country }))
    )
    .filter((league) => {
      const games =
        state === "live"
          ? league.liveGames
          : state === "prematch"
            ? league.prematchGames
            : league.activeGames;
      if (games === 0) return false;
      if (!debouncedSearch) return true;
      return [activeSportName, league.league.name, league.country.name].some((value) =>
        value.toLowerCase().includes(debouncedSearch)
      );
    })
    .sort(
      (left, right) =>
        Number(right.isTopLeague) - Number(left.isTopLeague) ||
        right.topWeight - left.topWeight ||
        Number(right.turnover) - Number(left.turnover)
    );
  const leagueKeys = leagues
    .map(({ country, league }) => `${country.slug}|${league.slug}`)
    .join(",");

  useEffect(() => {
    const node = scroller.current;
    if (!node) return;

    const update = () => {
      setCanScrollLeft(node.scrollLeft > 0);
      setCanScrollRight(
        node.scrollWidth > node.clientWidth && node.scrollLeft < node.scrollWidth - node.clientWidth
      );
    };
    update();
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("resize", update);
    };
  }, [leagueKeys]);

  function scroll(direction: "left" | "right") {
    const node = scroller.current;
    if (!node) return;
    const distance = node.clientWidth * 0.5;
    node.scrollBy({ left: direction === "left" ? -distance : distance, behavior: "smooth" });
  }

  function changeSearch(value: string) {
    setSearch(value);
    onSearch(value);
  }

  const itemClass =
    "group/league relative inline-flex h-8 min-w-fit shrink-0 items-center justify-center gap-1.5 overflow-hidden rounded-md px-3 text-[13px] leading-5 font-semibold whitespace-nowrap transition-colors duration-150";

  return (
    <div className="w-full border-b border-white/[0.07] bg-black">
      <div className="relative mx-auto flex h-12 w-full max-w-[1350px] items-center overflow-hidden px-4 lg:px-6">
        {canScrollLeft ? (
          <button
            type="button"
            onClick={() => scroll("left")}
            aria-label="Scroll leagues left"
            className="absolute top-0 bottom-0 left-0 z-10 grid w-10 cursor-pointer place-items-center bg-gradient-to-r from-black via-black to-transparent text-white"
          >
            <Chevron direction="left" />
          </button>
        ) : null}

        <div
          ref={scroller}
          onScroll={(event) => {
            const node = event.currentTarget;
            setCanScrollLeft(node.scrollLeft > 0);
            setCanScrollRight(
              node.scrollWidth > node.clientWidth &&
                node.scrollLeft < node.scrollWidth - node.clientWidth
            );
          }}
          className="relative h-full flex-1 touch-pan-x [scrollbar-width:none] overflow-x-auto overscroll-x-contain scroll-smooth [&::-webkit-scrollbar]:hidden"
        >
          <div className="flex h-full items-center gap-1 whitespace-nowrap">
            <button
              type="button"
              onClick={() => router.push(leagueHref(activeSport, "", "", state, eventKind))}
              className={`${itemClass} ${activeLeague ? "text-[#858b96] hover:bg-white/[0.05] hover:text-white" : "bg-[#172235] text-[#5ba8ff]"}`}
            >
              All
            </button>

            <div>
              <LeagueSearch value={search} onChange={changeSearch} />
            </div>

            {leagues.map(({ league, country }) => {
              const selected =
                activeLeague === league.slug && (!activeCountry || activeCountry === country.slug);
              return (
                <button
                  type="button"
                  key={`${country.slug}|${league.slug}`}
                  onClick={() =>
                    router.push(
                      selected
                        ? leagueHref(activeSport, "", "", state, eventKind)
                        : leagueHref(activeSport, country.slug, league.slug, state, eventKind)
                    )
                  }
                  className={`${itemClass} ${selected ? "bg-[#172235] text-[#5ba8ff]" : "text-[#858b96] hover:bg-white/[0.05] hover:text-white"}`}
                >
                  <LeagueCountryFlag
                    countrySlug={country.slug}
                    countryName={country.name}
                    leagueSlug={league.slug}
                    selected={selected}
                  />
                  <span className="relative">{league.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        {canScrollRight ? (
          <button
            type="button"
            onClick={() => scroll("right")}
            aria-label="Scroll leagues right"
            className="absolute top-0 right-0 bottom-0 z-10 grid w-10 cursor-pointer place-items-center bg-gradient-to-l from-black via-black to-transparent text-white"
          >
            <Chevron direction="right" />
          </button>
        ) : null}
      </div>
    </div>
  );
}
