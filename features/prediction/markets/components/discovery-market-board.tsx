"use client";

import { useState } from "react";
import type { DiscoveryCategory, DiscoveryMarketSort } from "../api";
import type { MarketSlipSelection } from "../bet-slip";
import { useDiscoveryEvents } from "../hooks/use-discovery-markets";
import { marketCategoryLabel } from "../navigation-config";
import { DiscoveryEventCard } from "./discovery-event-card";
import { DiscoverySortTabs } from "./discovery-sort-tabs";
import { MarketBoardSkeleton } from "./market-board-skeleton";

interface DiscoveryMarketBoardProps {
  category: DiscoveryCategory;
  selectedIds: ReadonlySet<string>;
  onSelect: (selection: MarketSlipSelection) => void;
}

export function DiscoveryMarketBoard({
  category,
  selectedIds,
  onSelect,
}: DiscoveryMarketBoardProps) {
  const [sort, setSort] = useState<DiscoveryMarketSort>("volume_24h");
  const events = useDiscoveryEvents(category, sort);
  const categoryLabel = marketCategoryLabel(category);

  return (
    <section className="border-y border-white/8 bg-[#09090b] sm:rounded-[12px] sm:border">
      <DiscoverySortTabs value={sort} onChange={setSort} />

      <div className="sticky top-[114px] z-40 grid grid-cols-[minmax(0,1fr)_150px] items-center gap-1.5 border-y border-white/8 bg-[#20232a]/[0.97] px-3 py-2 text-[9px] font-extrabold tracking-[0.08em] text-white/45 uppercase shadow-[0_5px_14px_rgba(0,0,0,0.28)] backdrop-blur-md sm:top-[126px] sm:grid-cols-[minmax(0,1fr)_320px] sm:gap-2 sm:px-8">
        <span>Market</span>
        <span className="grid grid-cols-2 gap-1.5 text-center sm:gap-2">
          <span>Yes</span>
          <span>No</span>
        </span>
      </div>

      <div className="space-y-2 py-2 sm:space-y-3 sm:p-4">
        {events.loading ? <MarketBoardSkeleton /> : null}

        {events.error ? (
          <div className="rounded-[10px] border border-red-400/20 bg-red-400/5 px-5 py-12 text-center">
            <p className="text-[13px] font-bold text-white/75">
              {categoryLabel} markets could not load.
            </p>
            <button
              type="button"
              onClick={() => void events.refetch()}
              className="mt-4 cursor-pointer rounded-[7px] bg-white/10 px-4 py-2 text-[11px] font-bold text-white hover:bg-white/15"
            >
              Try again
            </button>
          </div>
        ) : null}

        {!events.loading && !events.error && events.events.length === 0 ? (
          <div className="rounded-[10px] border border-white/8 bg-white/[0.025] px-5 py-14 text-center">
            <p className="text-[13px] font-bold text-white/70">
              No active {categoryLabel.toLowerCase()} markets.
            </p>
            <p className="mt-2 text-[11px] text-white/38">Try another market order.</p>
          </div>
        ) : null}

        {events.events.map((event) => (
          <DiscoveryEventCard
            key={event.id}
            category={category}
            event={event}
            selectedIds={selectedIds}
            onSelect={onSelect}
          />
        ))}

        {events.hasMore ? (
          <div className="flex flex-col items-center gap-2 py-2">
            <button
              type="button"
              onClick={() => void events.loadMore()}
              disabled={events.loadingMore}
              className="min-w-40 cursor-pointer rounded-[8px] border border-white/10 bg-[#242429] px-5 py-2.5 text-[11px] font-extrabold tracking-[0.04em] text-white transition-colors hover:bg-[#303036] disabled:cursor-wait disabled:opacity-55"
            >
              {events.loadingMore ? "Loading markets..." : "Load more markets"}
            </button>
            {events.loadMoreError ? (
              <p className="text-[10px] font-semibold text-red-300/80">
                More markets could not be loaded. Try again.
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
