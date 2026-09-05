"use client";

import Link from "next/link";
import type { DiscoveryCategory } from "../api";
import { discoverySlipSelection, toggleSlipSelection } from "../bet-slip";
import { closingLabel, compactUsd, eventTopic } from "../discovery-presenter";
import { useDiscoveryEvent } from "../hooks/use-discovery-markets";
import { updateMarketSlip, usePersistedMarketSlip } from "../market-slip-storage";
import { marketCategoryLabel } from "../navigation-config";
import { DiscoveryMarketRow } from "./discovery-market-row";
import { MarketBoardSkeleton } from "./market-board-skeleton";

interface DiscoveryEventDetailProps {
  category: DiscoveryCategory;
  eventId: string;
}

export function DiscoveryEventDetail({ category, eventId }: DiscoveryEventDetailProps) {
  const query = useDiscoveryEvent(eventId);
  const { selections } = usePersistedMarketSlip();
  const selectedIds = new Set(selections.map(({ id }) => id));
  const categoryLabel = marketCategoryLabel(category);
  const backHref = `/prediction/markets?category=${category}`;

  if (query.loading) return <MarketBoardSkeleton />;

  if (query.error || !query.event) {
    return (
      <div className="rounded-[12px] border border-red-400/20 bg-[#111114] px-5 py-16 text-center">
        <p className="text-[14px] font-bold text-white/75">
          This {categoryLabel.toLowerCase()} event could not load.
        </p>
        <div className="mt-5 flex justify-center gap-2">
          <Link
            href={backHref}
            className="rounded-[8px] border border-white/10 bg-white/5 px-4 py-2 text-[11px] font-bold text-white/65"
          >
            Back to {categoryLabel}
          </Link>
          <button
            type="button"
            onClick={() => void query.refetch()}
            className="cursor-pointer rounded-[8px] bg-[#c8c8cd] px-4 py-2 text-[11px] font-bold text-black"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  const event = query.event;

  return (
    <div className="space-y-4">
      <Link
        href={backHref}
        className="inline-flex items-center gap-2 text-[12px] font-bold text-white/48 transition-colors hover:text-white/80"
      >
        <span aria-hidden="true">&larr;</span>
        Back to {categoryLabel}
      </Link>

      <header className="overflow-hidden rounded-[12px] border border-white/8 bg-[#111114]">
        <div className="flex flex-col gap-4 p-4 sm:flex-row sm:p-5">
          <div className="size-20 shrink-0 overflow-hidden rounded-[12px] border border-white/10 bg-[#242428]">
            {event.imageUrl || event.iconUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={event.imageUrl ?? event.iconUrl ?? ""}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="grid h-full place-items-center text-[24px] font-black text-white/35">
                {category[0].toUpperCase()}
              </span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <span className="text-[10px] font-extrabold tracking-[0.1em] text-white/35 uppercase">
              {eventTopic(event)}
            </span>
            <h1 className="mt-1 text-[22px] leading-[1.2] font-bold tracking-[-0.02em] text-white/90 sm:text-[27px]">
              {event.title}
            </h1>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] font-semibold text-white/40">
              <span>{compactUsd(event.volume24h)} volume 24h</span>
              <span>{compactUsd(event.liquidity)} liquidity</span>
              <span>{closingLabel(event.endDate)}</span>
            </div>
          </div>
        </div>
        {event.description ? (
          <p className="border-t border-white/7 px-4 py-3.5 text-[12px] leading-5 text-white/48 sm:px-5">
            {event.description}
          </p>
        ) : null}
      </header>

      <section className="overflow-hidden rounded-[12px] border border-white/8 bg-[#09090b]">
        <div className="border-b border-white/8 bg-[#0d0d0f] px-4 py-3">
          <h2 className="text-[12px] font-extrabold tracking-[0.05em] text-white/65 uppercase">
            Markets &middot; {event.marketCount}
          </h2>
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_72px_72px] items-center gap-1.5 border-b border-white/8 bg-[#20232a] px-3.5 py-2 text-[9px] font-extrabold tracking-[0.08em] text-white/45 uppercase sm:hidden">
          <span>Market</span>
          <span className="text-center">Yes</span>
          <span className="text-center">No</span>
        </div>
        <div className="px-3.5 sm:px-4">
          {event.markets.map((market) => (
            <DiscoveryMarketRow
              key={market.id}
              market={market}
              selectedIds={selectedIds}
              onSelect={(selection) => {
                const candidate = discoverySlipSelection(event, selection);
                updateMarketSlip((current) => ({
                  ...current,
                  selections: toggleSlipSelection(current.selections, candidate),
                }));
              }}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
