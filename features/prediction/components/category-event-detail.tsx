"use client";

import Link from "next/link";
import { useDeferredValue, useState } from "react";
import type { PredictionCategory } from "../categories";
import {
  compactVolume,
  marketPrediction,
  marketTag,
  type CategoryPrediction,
} from "../category-market-presenter";
import { usePolymarketAccess } from "../hooks/use-polymarket-access";
import { useHouseSlip } from "../house-slip-store";
import { useDiscoveryEvent } from "../markets/hooks/use-discovery-markets";
import {
  CategoryBetSidebar,
  CategoryMarketImage,
  CategoryMarketRow,
  CategorySearchIcon,
  CategoryTopNav,
} from "./category-market-shared";
import { PredictionCategoryDrawer } from "./prediction-category-drawer";

interface CategoryEventDetailProps {
  // Every category, sports included. The screen reads the discovery endpoint,
  // which takes the event id alone, so the category only ever decides labels
  // and the back link. Narrowing it to the six non-sports categories was what
  // kept Polymarket's sports events off this screen.
  category: PredictionCategory;
  eventId: string;
}

export function CategoryEventDetail({ category, eventId }: CategoryEventDetailProps) {
  const query = useDiscoveryEvent(eventId);
  const access = usePolymarketAccess();
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [desktopBetOpen, setDesktopBetOpen] = useState(false);
  const [mobileBetOpen, setMobileBetOpen] = useState(false);
  const [search, setSearch] = useState("");
  const slip = useHouseSlip();
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());
  // Sports goes back to the desk, not to `?category=sports`: that listing is
  // the sportsbook, a different product off different ids, and the card that
  // opened this screen was on the desk.
  const backHref =
    category === "sports" ? "/prediction" : `/prediction/markets?category=${category}`;
  const openBet = (prediction: CategoryPrediction, side: "yes" | "no") => {
    slip.toggle(prediction, side);
    if (window.matchMedia("(min-width: 1280px)").matches) setDesktopBetOpen(true);
    else setMobileBetOpen(true);
  };

  return (
    <main className="relative min-h-screen bg-[#222] text-[#ebebeb]">
      <div
        className={`relative transition-[padding] duration-300 ease-in-out ${desktopBetOpen ? "xl:pr-[326px]" : ""}`}
      >
        <CategoryTopNav
          categoriesOpen={categoriesOpen}
          onOpenCategories={() => setCategoriesOpen(true)}
          category={category}
        />

        <div className="mx-auto w-full max-w-[1440px] px-3 py-5 md:px-5">
          <Link
            href={backHref}
            className="inline-flex items-center gap-2 text-xs font-semibold text-[#999] transition-colors hover:text-white"
          >
            <span aria-hidden="true">←</span>
            Back to {category} markets
          </Link>

          {query.loading ? (
            <div className="mt-4 space-y-2" role="status" aria-label="Loading event markets">
              <div className="h-36 animate-pulse rounded-md bg-[#242424]" />
              {Array.from({ length: 6 }, (_, index) => (
                <div key={index} className="h-[94px] animate-pulse bg-[#242424]" />
              ))}
            </div>
          ) : query.error || !query.event ? (
            <div className="mt-4 rounded-md border border-red-400/20 bg-[#171717] px-5 py-16 text-center">
              <p className="text-sm font-semibold text-white/75">This event could not be loaded.</p>
              <button
                type="button"
                onClick={() => void query.refetch()}
                className="mt-4 cursor-pointer rounded-lg bg-[#b9fcff] px-5 py-2 text-xs font-semibold text-[#171717]"
              >
                Try again
              </button>
            </div>
          ) : (
            <CategoryEventContent
              event={query.event}
              category={category}
              search={search}
              deferredSearch={deferredSearch}
              accessAllowed={access.allowed}
              onSearch={setSearch}
              onBuy={openBet}
              selectedSide={slip.selectedSide}
            />
          )}
        </div>
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
      <PredictionCategoryDrawer
        open={categoriesOpen}
        onClose={() => setCategoriesOpen(false)}
        activeCategory={category}
      />
    </main>
  );
}

function CategoryEventContent({
  event,
  category,
  search,
  deferredSearch,
  accessAllowed,
  onSearch,
  onBuy,
  selectedSide,
}: {
  event: NonNullable<ReturnType<typeof useDiscoveryEvent>["event"]>;
  category: PredictionCategory;
  search: string;
  deferredSearch: string;
  accessAllowed: boolean;
  onSearch: (value: string) => void;
  onBuy: (prediction: CategoryPrediction, side: "yes" | "no") => void;
  selectedSide: (conditionId: string) => "yes" | "no" | undefined;
}) {
  const predictions = event.markets.flatMap((market) => {
    const prediction = marketPrediction(event, market, category);
    return prediction ? [prediction] : [];
  });
  const visible = predictions.filter((prediction) =>
    `${prediction.q} ${prediction.tag}`.toLowerCase().includes(deferredSearch)
  );

  return (
    <div className="mt-4 space-y-4">
      <header className="overflow-hidden rounded-md border border-[#303030] bg-[#171717]">
        <div className="flex flex-col gap-4 p-4 sm:flex-row sm:p-5">
          <CategoryMarketImage src={event.imageUrl ?? event.iconUrl} size="size-20 sm:size-24" />
          <div className="min-w-0 flex-1">
            <span className="text-[10px] font-bold tracking-[0.1em] text-[#888] uppercase">
              {marketTag(event, category)}
            </span>
            <h1 className="mt-1 text-2xl leading-tight font-bold tracking-tight text-white sm:text-3xl">
              {event.title}
            </h1>
            <div className="mt-3 flex flex-wrap gap-3 text-xs font-medium text-[#888]">
              <span>{event.marketCount} markets</span>
              <span>{compactVolume(event.volume24h ?? event.volume) || "-"}</span>
              <span>{compactVolume(event.liquidity) || "-"} liquidity</span>
            </div>
          </div>
        </div>
        {event.description ? (
          <p className="border-t border-[#2b2b2b] px-4 py-3 text-xs leading-5 text-[#999] sm:px-5">
            {event.description}
          </p>
        ) : null}
      </header>

      <section className="overflow-hidden rounded-md border border-[#303030] bg-[#171717]">
        <div className="flex flex-col gap-3 border-b border-[#2b2b2b] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-sm font-semibold">Markets · {event.marketCount}</h2>
          <label className="flex h-9 w-full items-center rounded-lg border border-[#3a3a3a] bg-[#242424] px-3 text-[#777] focus-within:border-[#666] sm:max-w-xs">
            <span className="sr-only">Search event markets</span>
            <CategorySearchIcon className="size-4 shrink-0" />
            <input
              value={search}
              onChange={(changeEvent) => onSearch(changeEvent.target.value)}
              placeholder="Search markets..."
              className="min-w-0 flex-1 bg-transparent px-2 text-xs text-white outline-none placeholder:text-[#777]"
            />
          </label>
        </div>
        <div className="flex flex-col gap-1 p-2">
          {visible.map((prediction) => (
            <CategoryMarketRow
              key={prediction.conditionId}
              prediction={prediction}
              accessAllowed={accessAllowed}
              onBuy={(side) => onBuy(prediction, side)}
              selectedSide={selectedSide(prediction.conditionId)}
            />
          ))}
          {visible.length === 0 ? (
            <p className="px-4 py-16 text-center text-sm text-[#777]">
              No markets match your search.
            </p>
          ) : null}
        </div>
      </section>

      {!accessAllowed ? (
        <p className="text-xs text-[#ef9ca5]">
          Trading is unavailable in your region. You can still browse open markets.
        </p>
      ) : null}
    </div>
  );
}
