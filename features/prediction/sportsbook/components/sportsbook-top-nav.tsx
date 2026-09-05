"use client";

import Link from "next/link";
import { useDeferredValue, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { MarketLogo } from "@/components/ui/market-logo";
import { useSportsbookSearch } from "../hooks/use-sportsbook";
import { SportIcon } from "./sport-icon";

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5 shrink-0" fill="none">
      <path
        d="M11 19C15.4183 19 19 15.4183 19 11C19 6.58172 15.4183 3 11 3C6.58172 3 3 6.58172 3 11C3 15.4183 6.58172 19 11 19Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M21 21L16.65 16.65"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function SportsbookTopNav() {
  const { authenticated, login } = usePrivy();
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const searchQuery = useSportsbookSearch(deferredSearch);
  const searchOpen = search.trim().length >= 3;

  return (
    <div className="sticky top-0 z-[100] bg-[#171717] px-3 py-2 md:px-5">
      <div className="relative flex min-h-10 items-center justify-between gap-2 md:gap-4">
        <div className="flex shrink-0 items-center">
          <Link
            href="/dashboard"
            aria-label="Open dashboard"
            className="relative block h-8 md:h-[34px]"
          >
            <MarketLogo className="h-full w-auto" />
          </Link>
        </div>

        <div className="relative hidden max-w-xl min-w-[120px] flex-1 md:block">
          <div className="relative flex h-9 w-full items-center rounded-lg border border-[#2a2a2a] bg-white/[0.03] px-3 text-[#7e7e7e] transition-colors focus-within:border-[#3a3a3a] focus-within:bg-white/[0.06] hover:border-[#3a3a3a] hover:bg-white/[0.06]">
            <SearchIcon />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by sport, league, match, country..."
              className="min-w-0 flex-1 bg-transparent px-3 text-[13px] text-[#ebebeb] outline-none placeholder:text-[#7e7e7e]"
            />
            {search ? (
              <button
                type="button"
                onClick={() => setSearch("")}
                aria-label="Clear search"
                className="cursor-pointer text-lg leading-none text-[#7e7e7e] hover:text-[#ebebeb]"
              >
                ×
              </button>
            ) : null}
          </div>

          {searchOpen ? (
            <div className="absolute top-11 right-0 left-0 overflow-hidden rounded-lg border border-[#333] bg-[#171717] shadow-[0_24px_70px_rgba(0,0,0,.72)]">
              {searchQuery.isLoading ? (
                <p className="px-4 py-5 text-xs text-[#7e7e7e]">Searching markets...</p>
              ) : searchQuery.data?.events.length ? (
                searchQuery.data.events.slice(0, 8).map((event) => (
                  <Link
                    key={event.id}
                    href={`/prediction/markets/${event.id}?sport=${event.sport.slug}&country=${event.country.slug}&league=${event.league.slug}`}
                    onClick={() => setSearch("")}
                    className="flex items-center gap-3 border-b border-white/[0.05] px-4 py-3 hover:bg-[#242424]"
                  >
                    <SportIcon
                      sport={event.sport.slug}
                      name={event.sport.name}
                      className="size-8 shrink-0"
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-medium text-[#ebebeb]">
                        {event.title}
                      </span>
                      <span className="mt-1 block truncate text-[10px] text-[#7e7e7e]">
                        {event.country.name} · {event.league.name}
                      </span>
                    </span>
                  </Link>
                ))
              ) : (
                <p className="px-4 py-5 text-xs text-[#7e7e7e]">No matches found.</p>
              )}
            </div>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {authenticated ? (
            <Link
              href="/prediction/markets?view=tickets"
              className="flex items-center gap-2 rounded-lg border border-[#b9fcff] bg-[#b9fcff] px-4 py-2 text-sm font-medium text-[#171717] transition-colors hover:bg-[#b9fcff]/90"
            >
              My bets
            </Link>
          ) : (
            <button
              type="button"
              onClick={login}
              className="flex cursor-pointer items-center gap-2 rounded-lg border border-[#b9fcff] bg-[#b9fcff] px-4 py-2 text-sm font-medium text-[#171717] transition-colors hover:bg-[#b9fcff]/90"
            >
              Sign In
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
