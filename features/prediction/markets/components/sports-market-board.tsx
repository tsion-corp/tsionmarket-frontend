"use client";

import { useEffect, useState } from "react";
import type { NormalSport } from "../api";
import { COMBO_EVENT_PAGE_SIZE } from "../cache-policy";
import { mergeLeagueArtwork } from "../merge-league-artwork";
import type { BoardSelection, MarketWindow } from "../presenter";
import { filterEventsByWindow, groupLeagueFixtures } from "../presenter";
import { useComboTeamArtwork } from "../hooks/use-combo-team-artwork";
import { useSportsEvents, useSportsFilters } from "../hooks/use-sports-markets";
import { LeagueSection } from "./league-section";
import { MarketBoardFilters } from "./market-board-filters";
import { MarketBoardSkeleton } from "./market-board-skeleton";

interface SportsMarketBoardProps {
  sport: NormalSport;
  activeLeague: string;
  selectedIds: ReadonlySet<string>;
  onSelect: (selection: BoardSelection) => void;
  onRemoveSelection: (selectionId: string) => void;
}

export function SportsMarketBoard({
  sport,
  activeLeague,
  selectedIds,
  onSelect,
  onRemoveSelection,
}: SportsMarketBoardProps) {
  const [window, setWindow] = useState<MarketWindow>("upcoming");
  const filters = useSportsFilters(sport, activeLeague || undefined);
  const selectedLeague = activeLeague;
  const events = useSportsEvents(
    { sport, league: selectedLeague || undefined, limit: COMBO_EVENT_PAGE_SIZE },
    true
  );
  const eventsWithArtwork = useComboTeamArtwork(events.events);
  const eventsWithProviderArtwork = mergeLeagueArtwork(eventsWithArtwork, filters.leagues);
  const visibleEvents = filterEventsByWindow(eventsWithProviderArtwork, window);
  const groups = groupLeagueFixtures(visibleEvents);
  const shouldFindNextWindowPage =
    !events.loading &&
    !events.error &&
    visibleEvents.length === 0 &&
    events.hasMore &&
    !events.loadingMore &&
    !events.loadMoreError;
  const waitingForVisibleGames =
    groups.length === 0 && (events.loading || events.loadingMore || shouldFindNextWindowPage);

  useEffect(() => {
    if (shouldFindNextWindowPage) void events.loadMore();
  }, [events, shouldFindNextWindowPage]);

  return (
    <section className="overflow-hidden border-y border-white/8 bg-[#09090b] sm:rounded-[12px] sm:border">
      <MarketBoardFilters window={window} onWindowChange={setWindow} />

      <div className="space-y-2 py-2 sm:space-y-4 sm:p-4">
        {waitingForVisibleGames ? <MarketBoardSkeleton /> : null}

        {events.error ? (
          <div className="rounded-[10px] border border-red-400/20 bg-red-400/5 px-5 py-12 text-center">
            <p className="text-[13px] font-bold text-white/75">Markets could not be loaded.</p>
            <button
              type="button"
              onClick={() => void events.refetch()}
              className="mt-4 cursor-pointer rounded-[7px] bg-white/10 px-4 py-2 text-[11px] font-bold text-white hover:bg-white/15"
            >
              Try again
            </button>
          </div>
        ) : null}

        {!waitingForVisibleGames && !events.error && groups.length === 0 ? (
          <div className="rounded-[10px] border border-white/8 bg-white/[0.025] px-5 py-14 text-center">
            <p className="text-[13px] font-bold text-white/70">No matching games right now.</p>
            <p className="mt-2 text-[11px] text-white/38">Change the date or league filter.</p>
          </div>
        ) : null}

        {groups.map((group) => (
          <LeagueSection
            key={group.slug || group.name}
            group={group}
            selectedIds={selectedIds}
            onSelect={onSelect}
            onRemoveSelection={onRemoveSelection}
            sport={sport}
            activeLeague={selectedLeague}
          />
        ))}

        {events.hasMore && !shouldFindNextWindowPage ? (
          <div className="flex flex-col items-center gap-2 py-2">
            <button
              type="button"
              onClick={() => void events.loadMore()}
              disabled={events.loadingMore}
              className="min-w-40 cursor-pointer rounded-[8px] border border-white/10 bg-[#242429] px-5 py-2.5 text-[11px] font-extrabold tracking-[0.04em] text-white transition-colors hover:bg-[#303036] disabled:cursor-wait disabled:opacity-55"
            >
              {events.loadingMore ? "Loading games..." : "Load more games"}
            </button>
            {events.loadMoreError ? (
              <p className="text-[10px] font-semibold text-red-300/80">
                More games could not be loaded. Try again.
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
