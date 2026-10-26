"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { listBookBoard, type BookBoardEvent } from "@/features/prediction/book/api";
import type { BookPick } from "@/features/prediction/components/book-sportsbook-view";

function activeMarkets(event: BookBoardEvent) {
  return event.markets.filter((market) => !market.hidden && market.state === "active");
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
  const markets = (board.data?.events ?? [])
    .filter((event) => Number.isInteger(event.trendingRank))
    .sort((left, right) => (left.trendingRank ?? 999) - (right.trendingRank ?? 999))
    .flatMap((event) => activeMarkets(event).map((market) => ({ event, market })));

  if (board.isPending) {
    return (
      <section
        aria-label="Featured ARK markets"
        className="mx-auto w-full max-w-[1350px] px-4 py-5 lg:px-6"
      >
        <div className="flex gap-3 overflow-hidden">
          {Array.from({ length: 3 }, (_, index) => (
            <div
              key={index}
              className="h-52 w-[82vw] max-w-[360px] shrink-0 animate-pulse rounded-xl bg-white/[0.04]"
            />
          ))}
        </div>
      </section>
    );
  }

  if (!markets.length) return null;

  return (
    <section aria-label="Featured ARK markets" className="mx-auto w-full max-w-[1350px] py-5">
      <header className="mb-3 flex items-end justify-between gap-4 px-4 lg:px-6">
        <div>
          <p className="text-[10px] font-bold tracking-[0.16em] text-[#14be47] uppercase">
            Trending on ARK
          </p>
          <h2 className="mt-1 text-lg font-bold tracking-[-0.02em] text-white">Featured markets</h2>
        </div>
        <Link
          href="/prediction/local"
          className="shrink-0 text-xs font-semibold text-[#8dc3ff] hover:text-white"
        >
          View ARK Markets
        </Link>
      </header>

      <div className="flex snap-x snap-mandatory [scrollbar-width:none] gap-3 overflow-x-auto px-4 pb-2 lg:px-6 [&::-webkit-scrollbar]:hidden">
        {markets.map(({ event, market }) => {
          const outcomes = market.outcomes.filter((outcome) => !outcome.hidden).slice(0, 2);
          const imageUrl = market.imageUrl ?? event.imageUrl;

          return (
            <article
              key={`${event.id}:${market.id}`}
              className="relative isolate w-[82vw] max-w-[360px] shrink-0 snap-start overflow-hidden rounded-xl border border-white/10 bg-[#0b0d0c] shadow-[0_18px_50px_rgba(0,0,0,.25)]"
            >
              {imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={imageUrl}
                  alt=""
                  className="absolute inset-0 -z-20 h-full w-full object-cover opacity-25"
                />
              ) : null}
              <div className="absolute inset-0 -z-10 bg-[linear-gradient(105deg,rgba(5,8,6,.98)_18%,rgba(5,8,6,.86)_62%,rgba(5,8,6,.68))]" />

              <div className="flex h-full min-h-52 flex-col p-4">
                <div className="flex items-start gap-3">
                  <span className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-full border border-white/15 bg-black/40">
                    {imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={imageUrl} alt="" className="size-full object-cover" />
                    ) : (
                      <span className="text-sm font-bold text-white/60">
                        {market.title.slice(0, 1).toUpperCase()}
                      </span>
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <span className="inline-flex rounded-full border border-[#14be47]/35 bg-[#0d2d17]/85 px-2 py-1 text-[9px] font-bold tracking-[0.12em] text-[#5ee381] uppercase">
                      #{event.trendingRank} Trending
                    </span>
                    <h3 className="mt-2 line-clamp-1 text-xs font-semibold text-[#a7aba8]">
                      {event.title}
                    </h3>
                    <p className="mt-1 line-clamp-2 text-base leading-5 font-bold text-white">
                      {market.title}
                    </p>
                  </div>
                </div>

                <div className="mt-auto grid grid-cols-2 gap-2 pt-4">
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
