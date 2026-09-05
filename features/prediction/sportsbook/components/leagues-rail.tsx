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
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-6 fill-current" fill="none">
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
    <svg viewBox="0 0 16 16" aria-hidden="true" className="size-6 fill-current">
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
    <div className="group/search relative flex h-9 w-full min-w-[200px] shrink-0 items-center rounded-lg border border-[#4a5568] bg-[#2d3748] px-3 transition-all duration-200 focus-within:border-[#3182ce] focus-within:shadow-[0_0_0_2px_rgba(49,130,206,.3)] md:h-10 md:w-[200px] md:max-w-[240px] md:px-4 md:focus-within:w-[240px]">
      <span className="absolute top-1/2 left-3 -translate-y-1/2 text-[#718096] transition-colors group-focus-within/search:text-[#3182ce]">
        <SearchIcon />
      </span>
      <label className="relative flex flex-1 items-center">
        <span className="sr-only">Filter leagues</span>
        <input
          type="text"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Filter search..."
          className="w-full bg-transparent py-0 pr-6 pl-8 text-base text-white outline-none placeholder:text-[#718096]"
        />
        {value ? (
          <button
            type="button"
            onClick={() => onChange("")}
            aria-label="Clear league search"
            className="absolute right-1 grid size-5 cursor-pointer place-items-center text-[#718096] hover:text-[#a0aec0]"
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
    "group/league relative inline-flex h-9 min-w-fit shrink-0 items-center justify-center overflow-hidden rounded-lg px-3 text-[.9rem] leading-5 font-light whitespace-nowrap text-white transition-colors duration-200 md:h-10 md:px-5 md:leading-6";

  return (
    <div className="mb-1 md:mt-2 md:mb-6">
      <div className="mb-3 w-full md:mb-0">
        <div className="mb-[.1rem] w-full px-1.5 md:hidden">
          <LeagueSearch value={search} onChange={changeSearch} />
        </div>

        <div className="relative mt-2 mb-0 flex w-full items-center gap-2 overflow-hidden rounded-lg md:mt-0 md:mb-5">
          {canScrollLeft ? (
            <button
              type="button"
              onClick={() => scroll("left")}
              aria-label="Scroll leagues left"
              className="absolute top-1/2 left-0 z-10 hidden h-10 w-[70px] -translate-y-1/2 cursor-pointer items-center justify-start bg-[linear-gradient(90deg,rgba(35,45,62,1)_0%,rgba(35,45,62,1)_50%,rgba(45,55,72,0)_100%)] pl-1.5 text-[#a0aec0] transition-colors duration-200 hover:text-white md:flex"
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
            className="relative flex-1 [scrollbar-width:none] overflow-x-auto [&::-webkit-scrollbar]:hidden"
          >
            <div className="flex items-center gap-2 pl-2 whitespace-nowrap md:pl-0">
              <button
                type="button"
                onClick={() => router.push(leagueHref(activeSport, "", "", state, eventKind))}
                className={`${itemClass} ${activeLeague ? "bg-[#2d3748] hover:bg-[#3a4556]" : "bg-[#3182ce]"}`}
              >
                All
              </button>

              <div className="hidden md:block">
                <LeagueSearch value={search} onChange={changeSearch} />
              </div>

              {leagues.map(({ league, country }) => {
                const selected =
                  activeLeague === league.slug &&
                  (!activeCountry || activeCountry === country.slug);
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
                    className={`${itemClass} ${selected ? "bg-[#3182ce]" : "bg-[#2d3748] hover:bg-[#3a4556]"}`}
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
              className="absolute top-1/2 right-0 z-10 hidden h-10 w-[70px] -translate-y-1/2 cursor-pointer items-center justify-end bg-[linear-gradient(270deg,rgba(35,45,62,1)_0%,rgba(35,45,62,1)_50%,rgba(45,55,72,0)_100%)] pr-1.5 text-[#a0aec0] transition-colors duration-200 hover:text-white md:flex"
            >
              <Chevron direction="right" />
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
