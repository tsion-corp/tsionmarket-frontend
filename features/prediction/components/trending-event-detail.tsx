"use client";

import Link from "next/link";
import { useState } from "react";
import {
  predictionCategoryHref,
  type PredictionMarketCategory,
} from "@/features/prediction/categories";
import { usePolymarketAccess } from "@/features/prediction/hooks/use-polymarket-access";
import { useDiscoveryEvent } from "@/features/prediction/markets/hooks/use-discovery-markets";
import { marketPrediction, marketTag, type CategoryPrediction } from "../category-market-presenter";
import { useHouseSlip } from "../house-slip-store";
import {
  CategoryBetSidebar,
  CategoryMarketImage,
  CategoryMarketRow,
} from "./category-market-shared";
import { PredictionCategoryNav } from "./prediction-category-nav";

function BackIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="size-4 fill-current">
      <path d="M9.807 4.473a.664.664 0 0 0-.94 0l-3.06 3.06c-.26.26-.26.68 0 .94l3.06 3.06a.664.664 0 1 0 .94-.94L7.22 8l2.587-2.587a.67.67 0 0 0 0-.94Z" />
    </svg>
  );
}

export function DiscoveryEventDetail({
  eventId,
  category,
}: {
  eventId: string;
  category: PredictionMarketCategory;
}) {
  const query = useDiscoveryEvent(eventId);
  const access = usePolymarketAccess();
  const slip = useHouseSlip();
  const [desktopBetOpen, setDesktopBetOpen] = useState(false);
  const [mobileBetOpen, setMobileBetOpen] = useState(false);
  const openBet = (prediction: CategoryPrediction, side: "yes" | "no") => {
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
          activeFilter={category === "trending" ? "trending" : undefined}
          activeCategory={category === "trending" ? undefined : category}
        />

        <div className="mx-auto w-full max-w-[1350px] px-4 py-5 lg:px-6">
          <Link
            href={category === "trending" ? "/prediction" : predictionCategoryHref(category)}
            className="inline-flex h-8 items-center gap-1 rounded-md pr-3 text-[13px] font-medium text-[#858b96] transition-colors hover:text-white"
          >
            <BackIcon />
            Back to markets
          </Link>

          {query.loading ? (
            <div
              className="mt-3 border-y border-white/[0.06]"
              role="status"
              aria-label="Loading event markets"
            >
              <div className="h-32 animate-pulse bg-black" />
              {Array.from({ length: 5 }, (_, index) => (
                <div
                  key={index}
                  className="h-[94px] animate-pulse border-t border-white/[0.06] bg-black"
                />
              ))}
            </div>
          ) : query.error || !query.event ? (
            <div className="mt-3 border-y border-white/[0.06] px-5 py-20 text-center">
              <p className="text-sm font-medium text-[#a5a9b1]">This market could not load.</p>
              <button
                type="button"
                onClick={() => void query.refetch()}
                className="mt-4 cursor-pointer rounded-md bg-white px-5 py-2 text-xs font-semibold text-black"
              >
                Try again
              </button>
            </div>
          ) : (
            <DiscoveryEventContent
              event={query.event}
              category={category}
              accessAllowed={access.allowed}
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
    </main>
  );
}

function DiscoveryEventContent({
  event,
  category,
  accessAllowed,
  onBuy,
  selectedSide,
}: {
  event: NonNullable<ReturnType<typeof useDiscoveryEvent>["event"]>;
  category: PredictionMarketCategory;
  accessAllowed: boolean;
  onBuy: (prediction: CategoryPrediction, side: "yes" | "no") => void;
  selectedSide: (conditionId: string) => "yes" | "no" | undefined;
}) {
  const predictions = event.markets.flatMap((market) => {
    const prediction = marketPrediction(event, market, category);
    return prediction ? [prediction] : [];
  });

  return (
    <div className="mt-3 border-y border-white/[0.07]">
      <header className="flex flex-col gap-4 border-b border-white/[0.07] bg-black px-3 py-5 sm:flex-row sm:items-center sm:px-4">
        <CategoryMarketImage src={event.imageUrl ?? event.iconUrl} size="size-16 sm:size-20" />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold text-[#858b96]">{marketTag(event, category)}</p>
          <h1 className="mt-1 max-w-4xl text-xl leading-7 font-semibold tracking-[-0.02em] text-white sm:text-2xl">
            {event.title}
          </h1>
          <p className="mt-2 text-xs text-[#777d87]">
            {predictions.length} {predictions.length === 1 ? "market" : "markets"}
          </p>
        </div>
      </header>

      {event.description ? (
        <p className="border-b border-white/[0.07] px-3 py-4 text-[13px] leading-5 text-[#a5a9b1] sm:px-4">
          {event.description}
        </p>
      ) : null}

      <section aria-label="Event outcomes" className="bg-black">
        {predictions.map((prediction) => (
          <CategoryMarketRow
            key={prediction.conditionId}
            prediction={prediction}
            accessAllowed={accessAllowed}
            onBuy={(side) => onBuy(prediction, side)}
            selectedSide={selectedSide(prediction.conditionId)}
            showVolume={false}
            surface="black"
          />
        ))}
        {predictions.length === 0 ? (
          <p className="px-4 py-16 text-center text-sm text-[#777d87]">
            No open outcomes are available for this market.
          </p>
        ) : null}
      </section>

      {!accessAllowed ? (
        <p className="border-t border-white/[0.07] px-4 py-3 text-xs text-[#ef9ca5]">
          Trading is unavailable in your region. You can still browse open markets.
        </p>
      ) : null}
    </div>
  );
}
