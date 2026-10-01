"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { listBookBoard, type BookBoardEvent } from "@/features/prediction/book/api";
import type { BookPick } from "@/features/prediction/components/book-sportsbook-view";

function primaryMarket(event: BookBoardEvent) {
  const active = event.markets.filter((market) => !market.hidden && market.state === "active");
  return active.find((market) => market.id === event.primaryMarketId) ?? active[0] ?? null;
}

export function FeaturedLocalMarkets({
  pick,
  onPick,
}: {
  pick: BookPick | null;
  onPick: (pick: BookPick) => void;
}) {
  const board = useQuery({
    queryKey: ["prediction", "book", "board", "featured"],
    queryFn: () => listBookBoard({}),
    staleTime: 10_000,
    refetchInterval: 30_000,
    retry: false,
  });
  const events = (board.data?.events ?? [])
    .filter((event) => Number.isInteger(event.trendingRank) && primaryMarket(event))
    .sort((left, right) => (left.trendingRank ?? 999) - (right.trendingRank ?? 999))
    .slice(0, 2);

  if (board.isPending) {
    return (
      <section
        aria-label="Featured ARK markets"
        className="mx-auto w-full max-w-[1350px] px-4 py-5 lg:px-6"
      >
        <div className="grid gap-3 md:grid-cols-2">
          <div className="h-52 animate-pulse rounded-xl bg-white/[0.04]" />
          <div className="h-52 animate-pulse rounded-xl bg-white/[0.04]" />
        </div>
      </section>
    );
  }

  if (!events.length) return null;

  return (
    <section
      aria-label="Featured ARK markets"
      className="mx-auto w-full max-w-[1350px] px-4 py-5 lg:px-6"
    >
      <header className="mb-3 flex items-end justify-between gap-4">
        <div>
          <p className="text-[10px] font-bold tracking-[0.16em] text-[#14be47] uppercase">
            Ark Matchday
          </p>
          <h2 className="mt-1 text-lg font-bold tracking-[-0.02em] text-white">Featured fights</h2>
        </div>
        <Link
          href="/prediction/local"
          className="shrink-0 text-xs font-semibold text-[#8dc3ff] hover:text-white"
        >
          View ARK Markets
        </Link>
      </header>

      <div className="grid gap-3 md:grid-cols-2">
        {events.map((event) => {
          const market = primaryMarket(event);
          if (!market) return null;
          const imageSide = event.trendingRank === 2 ? "right-0" : "left-0";
          const outcomes = market.outcomes.filter((outcome) => !outcome.hidden).slice(0, 2);
          const openMarketCount = event.markets.filter(
            (item) => !item.hidden && item.state === "active"
          ).length;

          return (
            <article
              key={event.id}
              className="relative isolate overflow-hidden rounded-xl border border-white/10 bg-[#0b0d0c] shadow-[0_18px_50px_rgba(0,0,0,.25)]"
            >
              {event.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={event.imageUrl}
                  alt=""
                  className={`absolute top-0 -z-20 h-full w-[200%] max-w-none object-cover opacity-30 ${imageSide}`}
                />
              ) : null}
              <div className="absolute inset-0 -z-10 bg-[linear-gradient(100deg,rgba(5,8,6,.98)_15%,rgba(5,8,6,.84)_58%,rgba(5,8,6,.68))]" />

              <div className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <span className="inline-flex rounded-full border border-[#14be47]/35 bg-[#0d2d17]/85 px-2 py-1 text-[9px] font-bold tracking-[0.12em] text-[#5ee381] uppercase">
                      #{event.trendingRank} Trending
                    </span>
                    <h3 className="mt-2 line-clamp-2 text-base leading-5 font-bold text-white">
                      {event.title}
                    </h3>
                    <p className="mt-1 truncate text-[11px] font-semibold text-[#a7aba8]">
                      {market.title}
                    </p>
                  </div>
                  <Link
                    href={`/prediction/local?event=${encodeURIComponent(event.slug)}`}
                    className="shrink-0 rounded-md border border-white/15 bg-black/35 px-2.5 py-1.5 text-[10px] font-semibold text-white hover:bg-white/10"
                  >
                    View all {openMarketCount}
                  </Link>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2">
                  {outcomes.map((outcome, index) => {
                    const selected = pick?.outcome.id === outcome.id;
                    const color =
                      index === 0
                        ? selected
                          ? "border-[#14be47] bg-[#123b20] text-[#65e58b] ring-1 ring-[#14be47]"
                          : "border-[#17652f] bg-[#0c2514]/95 text-[#47d674] hover:border-[#14be47] hover:bg-[#123b20]"
                        : selected
                          ? "border-[#ef4055] bg-[#42151b] text-[#ff8291] ring-1 ring-[#ef4055]"
                          : "border-[#7a2933] bg-[#2a1014]/95 text-[#ff687a] hover:border-[#ef4055] hover:bg-[#42151b]";
                    return (
                      <button
                        key={outcome.id}
                        type="button"
                        disabled={outcome.state !== "active"}
                        aria-pressed={selected}
                        aria-label={`${event.title}, ${market.title}, ${outcome.title} at ${outcome.odds}`}
                        onClick={() => onPick({ event, market, outcome })}
                        className={`flex min-h-14 cursor-pointer items-center justify-between gap-2 rounded-lg border px-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${color}`}
                      >
                        <span className="line-clamp-2 text-[11px] leading-4 font-semibold">
                          {outcome.title}
                        </span>
                        <span className="shrink-0 text-sm font-black text-white tabular-nums">
                          {outcome.odds}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
