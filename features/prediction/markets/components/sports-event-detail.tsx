"use client";

import { useState } from "react";
import Link from "next/link";
import { sportsSlipSelection, toggleSlipSelection } from "../bet-slip";
import {
  eventMarketGroups,
  type EventMarketTab,
  type EventOutcomeView,
} from "../event-detail-presenter";
import { useSportsEvent } from "../hooks/use-sports-markets";
import { updateMarketSlip, usePersistedMarketSlip } from "../market-slip-storage";
import type { NormalSport } from "../api";
import { EventDetailHeader } from "./event-detail-header";
import { EventMarketCard } from "./event-market-card";
import { EventMarketTabs } from "./event-market-tabs";
import { MarketBoardSkeleton } from "./market-board-skeleton";

interface SportsEventDetailProps {
  eventId: string;
  sport: NormalSport;
  activeLeague: string;
}

export function SportsEventDetail({ eventId, sport, activeLeague }: SportsEventDetailProps) {
  const query = useSportsEvent(eventId);
  const [activeTab, setActiveTab] = useState<EventMarketTab>("all");
  const { selections } = usePersistedMarketSlip();
  const selectedIds = new Set(selections.map(({ id }) => id));
  const backHref = `/prediction/markets?category=${sport}${activeLeague ? `&league=${activeLeague}` : ""}`;

  if (query.loading) return <MarketBoardSkeleton />;

  if (query.error || !query.event) {
    return (
      <div className="rounded-[12px] border border-red-400/20 bg-[#111114] px-5 py-16 text-center">
        <p className="text-[14px] font-bold text-white/75">This event could not be loaded.</p>
        <div className="mt-5 flex justify-center gap-2">
          <Link
            href={backHref}
            className="rounded-[8px] border border-white/10 bg-white/5 px-4 py-2 text-[11px] font-bold text-white/65"
          >
            Back to games
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

  const groups = eventMarketGroups(query.event);
  const visibleGroups =
    activeTab === "all" ? groups : groups.filter((group) => group.key === activeTab);

  function selectOutcome(outcome: EventOutcomeView) {
    const candidate = sportsSlipSelection(outcome.selection);
    if (!candidate) return;
    updateMarketSlip((current) => ({
      ...current,
      selections: toggleSlipSelection(current.selections, candidate),
    }));
  }

  return (
    <div className="space-y-4">
      <Link
        href={backHref}
        className="inline-flex items-center gap-2 text-[12px] font-bold text-white/48 transition-colors hover:text-white/80"
      >
        <span aria-hidden="true">&larr;</span>
        Back to games
      </Link>

      <EventDetailHeader event={query.event} />

      <section className="overflow-hidden rounded-[12px] border border-white/8 bg-[#09090b]">
        <EventMarketTabs groups={groups} active={activeTab} onChange={setActiveTab} />
        <div className="space-y-5 p-3 sm:p-4">
          {visibleGroups.map((group) => (
            <section key={group.key}>
              <div className="mb-2.5 flex items-center gap-2">
                <h2 className="text-[12px] font-extrabold tracking-[0.04em] text-white/65 uppercase">
                  {group.title}
                </h2>
                <span className="h-px flex-1 bg-white/7" />
              </div>
              <div className="grid gap-2.5 sm:grid-cols-2">
                {group.cards.map((card) => (
                  <EventMarketCard
                    key={card.id}
                    card={card}
                    selectedId={
                      card.outcomes.find((outcome) => selectedIds.has(outcome.selection.id))
                        ?.selection.id ?? null
                    }
                    onSelect={selectOutcome}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      </section>
    </div>
  );
}
