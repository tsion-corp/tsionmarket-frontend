"use client";

import { useState } from "react";
import type { PredictionMarketCategory } from "@/features/prediction/categories";
import { usePolymarketAccess } from "@/features/prediction/hooks/use-polymarket-access";
import { usePolymarketPositionsController } from "../hooks/use-polymarket-positions-controller";
import type { DiscoveryMarketEvent, DiscoveryMarketSort } from "@/features/prediction/markets/api";
import { useDiscoveryEvents } from "@/features/prediction/markets/hooks/use-discovery-markets";
import { marketPrediction } from "../category-market-presenter";
import { useHouseSlip } from "../house-slip-store";
import { CategoryEventRow } from "./category-event-row";
import { CategoryBetSidebar } from "./category-market-shared";
import { HorizontalNavRail } from "./horizontal-nav-rail";
import { PredictionPositions } from "./prediction-positions";
import { PredictionCategoryNav, type PredictionFeedFilter } from "./prediction-category-nav";

interface DiscoveryTopic {
  slug: string;
  label: string;
  volume24h: number;
  eventCount: number;
}

const GENERIC_TAGS = new Set(["all", "trending"]);

function eventVolume(event: DiscoveryMarketEvent): number {
  return event.volume24h ?? event.volume ?? 0;
}

export function rankDiscoveryTopics(
  events: DiscoveryMarketEvent[],
  category: PredictionMarketCategory,
  limit = 8
): DiscoveryTopic[] {
  const topics = new Map<string, DiscoveryTopic>();

  for (const event of events) {
    const volume24h = eventVolume(event);
    const seen = new Set<string>();
    for (const tag of event.tags) {
      const slug = tag.slug.trim().toLowerCase();
      if (!slug || slug === category || GENERIC_TAGS.has(slug) || seen.has(slug)) continue;
      seen.add(slug);
      const current = topics.get(slug);
      topics.set(slug, {
        slug,
        label: current?.label ?? tag.label,
        volume24h: (current?.volume24h ?? 0) + volume24h,
        eventCount: (current?.eventCount ?? 0) + 1,
      });
    }
  }

  return Array.from(topics.values())
    .sort(
      (left, right) =>
        right.volume24h - left.volume24h ||
        right.eventCount - left.eventCount ||
        left.label.localeCompare(right.label)
    )
    .slice(0, limit);
}

function hasTopic(event: DiscoveryMarketEvent, topic: string): boolean {
  return !topic || event.tags.some((tag) => tag.slug.toLowerCase() === topic);
}

function DiscoveryFilters({
  topics,
  activeTopic,
  label,
  onTopicChange,
}: {
  topics: DiscoveryTopic[];
  activeTopic: string;
  label: string;
  onTopicChange: (topic: string) => void;
}) {
  const filterClass =
    "h-8 shrink-0 cursor-pointer rounded-md px-3 font-sans text-[14px] leading-5 font-medium tracking-[-0.09px] whitespace-nowrap transition-colors";

  return (
    <HorizontalNavRail
      ariaLabel={`${label} market filters`}
      itemCount={topics.length + 1}
      className="border-y border-white/[0.07] bg-black"
      viewportClassName="mx-auto flex h-12 max-w-[1350px] items-center gap-1 px-4 lg:px-6"
      edgeClassName="from-black via-black/95"
    >
      <button
        type="button"
        aria-pressed={!activeTopic}
        onClick={() => onTopicChange("")}
        className={`${filterClass} ${
          activeTopic
            ? "text-[#858b96] hover:bg-white/[0.05] hover:text-white"
            : "bg-[#172235] text-[#5ba8ff]"
        }`}
      >
        All
      </button>
      {topics.map((topic) => {
        const active = activeTopic === topic.slug;
        return (
          <button
            key={topic.slug}
            type="button"
            aria-pressed={active}
            onClick={() => onTopicChange(active ? "" : topic.slug)}
            className={`${filterClass} ${
              active
                ? "bg-[#172235] text-[#5ba8ff]"
                : "text-[#858b96] hover:bg-white/[0.05] hover:text-white"
            }`}
          >
            {topic.label}
          </button>
        );
      })}
    </HorizontalNavRail>
  );
}

export function DiscoveryMarketsFeed({
  category,
  sort = "volume_24h",
  activeFilter,
}: {
  category: PredictionMarketCategory;
  sort?: DiscoveryMarketSort;
  activeFilter?: PredictionFeedFilter;
}) {
  const catalog = useDiscoveryEvents(category, sort, { limit: 20, marketLimit: 2 });
  const access = usePolymarketAccess();
  const slip = useHouseSlip();
  const [activeTopic, setActiveTopic] = useState("");
  // "Your positions", above the list. The controller holds no query and polls
  // nothing: it is plain state plus a refresh callback, so mounting it here
  // costs the prediction service no request until somebody presses Load.
  const positionsCtl = usePolymarketPositionsController();
  const [desktopBetOpen, setDesktopBetOpen] = useState(false);
  const [mobileBetOpen, setMobileBetOpen] = useState(false);
  const viewableEvents = catalog.events.filter((event) =>
    event.markets.some((market) => marketPrediction(event, market, category))
  );
  const rawLabel = activeFilter ?? category;
  const label = rawLabel[0].toUpperCase() + rawLabel.slice(1);
  const topics = rankDiscoveryTopics(viewableEvents, category);
  const visibleEvents = viewableEvents.filter((event) => hasTopic(event, activeTopic));
  const openBet = (
    prediction: NonNullable<ReturnType<typeof marketPrediction>>,
    side: "yes" | "no"
  ) => {
    slip.toggle(prediction, side);
    if (window.matchMedia("(min-width: 1280px)").matches) setDesktopBetOpen(true);
    else setMobileBetOpen(true);
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-black text-white">
      <div
        className={`relative transition-[padding] duration-300 ease-in-out ${desktopBetOpen ? "xl:pr-[326px]" : ""}`}
      >
        <PredictionCategoryNav
          activeFilter={activeFilter}
          activeCategory={category === "trending" ? undefined : category}
        />
        <DiscoveryFilters
          topics={topics}
          activeTopic={activeTopic}
          label={label}
          onTopicChange={setActiveTopic}
        />

        {/* Above the market list rather than under it: somebody who opened
            this page to check an open bet, claim a win or cash out should not
            have to scroll a feed to find it. The panel is its own card, so it
            takes the section's gutter rather than the list's full-bleed rows. */}
        <div className="mx-auto w-full max-w-[1350px] px-4 pb-7 sm:pb-9 lg:px-6">
          <PredictionPositions controller={positionsCtl} />
        </div>

        <section aria-label={`${label} markets`} className="mx-auto w-full max-w-[1350px] pb-16">
          {catalog.loading ? (
            <div className="flex flex-col gap-px border-y border-white/[0.06] bg-white/[0.06]">
              {Array.from({ length: 8 }, (_, index) => (
                <div key={index} className="h-[94px] animate-pulse bg-black" />
              ))}
            </div>
          ) : catalog.unavailable ? (
            <div role="status" className="border-y border-white/[0.06] bg-black px-5 py-14">
              <div className="mx-auto max-w-sm text-center">
                <div className="mx-auto mb-4 h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-white" />
                <p className="text-sm font-semibold text-white">Your connection is slow</p>
                <p className="mt-2 text-xs leading-5 text-[#858b96]">
                  Markets are taking longer than expected. We will keep trying in the background.
                </p>
                <button
                  type="button"
                  onClick={() => void catalog.refetch()}
                  className="mt-5 cursor-pointer rounded-md border border-white/15 px-5 py-2 text-xs font-semibold text-white transition-colors hover:border-white/30 hover:bg-white/[0.05]"
                >
                  Try again
                </button>
              </div>
            </div>
          ) : catalog.error ? (
            <div className="border-y border-white/[0.06] px-5 py-20 text-center">
              <p className="text-sm font-medium text-[#a5a9b1]">
                {label[0].toUpperCase() + label.slice(1)} markets could not load.
              </p>
              <button
                type="button"
                onClick={() => void catalog.refetch()}
                className="mt-4 cursor-pointer rounded-md bg-white px-5 py-2 text-xs font-semibold text-black"
              >
                Try again
              </button>
            </div>
          ) : visibleEvents.length === 0 ? (
            <div className="border-y border-white/[0.06] px-5 py-20 text-center text-sm text-[#777d87]">
              No markets match these filters.
            </div>
          ) : (
            <div className="flex flex-col border-y border-white/[0.06] bg-black">
              {visibleEvents.map((event) => (
                <CategoryEventRow
                  key={event.id}
                  event={event}
                  category={category}
                  matches={() => true}
                  accessAllowed={access.allowed}
                  onBuy={openBet}
                  selectedSide={slip.selectedSide}
                  showVolume={false}
                  surface="black"
                />
              ))}
            </div>
          )}

          {!catalog.loading && !catalog.error && !catalog.unavailable ? (
            <footer className="flex items-center justify-between px-4 py-4 text-xs text-[#777d87] lg:px-6">
              <span>{visibleEvents.length} markets shown</span>
              {catalog.hasMore ? (
                <button
                  type="button"
                  onClick={() => void catalog.loadMore()}
                  disabled={catalog.loadingMore}
                  className="cursor-pointer rounded-md border border-white/10 px-4 py-2 font-medium text-[#a5a9b1] transition-colors hover:border-white/20 hover:text-white disabled:cursor-wait disabled:opacity-50"
                >
                  {catalog.loadingMore ? "Loading..." : "Load more"}
                </button>
              ) : null}
            </footer>
          ) : null}
          {catalog.loadMoreError ? (
            <p role="alert" className="px-4 pb-4 text-xs text-[#ef9ca5] lg:px-6">
              More markets could not load. Please try again.
            </p>
          ) : null}
          {!access.allowed ? (
            <p className="px-4 pb-4 text-xs text-[#ef9ca5] lg:px-6">
              Trading is unavailable in your region. You can still browse open markets.
            </p>
          ) : null}
        </section>
      </div>

      <CategoryBetSidebar
        selections={slip.selections}
        desktopOpen={desktopBetOpen}
        mobileOpen={mobileBetOpen}
        onDesktopOpenChange={setDesktopBetOpen}
        onMobileOpenChange={setMobileBetOpen}
        onRemove={slip.remove}
        onClear={slip.clear}
      />
    </main>
  );
}

export function TrendingMarketsFeed() {
  return <DiscoveryMarketsFeed category="trending" activeFilter="trending" />;
}
