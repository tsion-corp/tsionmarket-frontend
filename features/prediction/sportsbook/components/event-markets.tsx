"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  MarketOutcome,
  SlipSelection,
  SportsbookCapabilities,
  SportsbookEvent,
  SportsbookMarket,
} from "../api";
import {
  chunkMarketOutcomes,
  filterEventMarketGroups,
  groupEventMarkets,
  outcomeTitle,
  type EventMarketGroup,
} from "../event-market-groups";
import { useSportsbookEvent } from "../hooks/use-sportsbook";
import { useSportsbookRealtime } from "../hooks/use-sportsbook-realtime";
import { toggleSportsbookSelection, useSportsbookSlip } from "../slip-store";
import { LeagueCountryFlag } from "./league-country-flag";
import { SportIcon } from "./sport-icon";

interface EventMarketsProps {
  eventId: string;
  sport: string;
  country: string;
  league: string;
  capabilities: SportsbookCapabilities | undefined;
}

function eventTime(startsAt: number): { day: string; time: string } {
  const timestamp = startsAt < 10_000_000_000 ? startsAt * 1_000 : startsAt;
  const date = new Date(timestamp);
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const day =
    date.toDateString() === today.toDateString()
      ? "Today"
      : date.toDateString() === tomorrow.toDateString()
        ? "Tomorrow"
        : new Intl.DateTimeFormat(undefined, { day: "2-digit", month: "short" }).format(date);

  return {
    day,
    time: new Intl.DateTimeFormat(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(date),
  };
}

function backHref(sport: string, country: string, league: string): string {
  const query = new URLSearchParams({ sport });
  if (country) query.set("country", country);
  if (league) query.set("league", league);
  return `/prediction/markets?${query}`;
}

function canSelect(market: SportsbookMarket, live: boolean): boolean {
  return (
    !market.hidden &&
    market.state === "active" &&
    (live ? market.liveEnabled : market.prematchEnabled)
  );
}

function Chevron({ direction = "down" }: { direction?: "down" | "left" | "right" }) {
  const rotation = direction === "left" ? "rotate-90" : direction === "right" ? "-rotate-90" : "";
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className={`size-4 fill-current ${rotation}`}>
      <path d="m4.9 6.25 3.1 3.1 3.1-3.1.85.85L8 11.05 4.05 7.1z" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="size-4 shrink-0 fill-none stroke-current"
    >
      <circle cx="11" cy="11" r="7" strokeWidth="2" />
      <path d="m20 20-4-4" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function CollapseIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="size-4 fill-current">
      {expanded ? (
        <path d="m6.8 16.1 3.2-3.2 3.2 3.2 1.1-1.2-3.7-3.7a.8.8 0 0 0-1.2 0l-3.7 3.7 1.1 1.2Zm6.4-12.2L10 7.1 6.8 3.9 5.7 5.1l3.7 3.7c.3.3.9.3 1.2 0l3.7-3.7-1.1-1.2Z" />
      ) : (
        <path d="m6.8 11.9 3.2 3.2 3.2-3.2 1.1 1.2-3.7 3.7a.8.8 0 0 1-1.2 0l-3.7-3.7 1.1-1.2Zm6.4-3.8L10 4.9 6.8 8.1 5.7 6.9l3.7-3.7c.3-.3.9-.3 1.2 0l3.7 3.7-1.1 1.2Z" />
      )}
    </svg>
  );
}

function ParticipantLogo({
  participant,
}: {
  participant: SportsbookEvent["participants"][number];
}) {
  return (
    <div className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-full border border-white/10 bg-[#2e2e2e]/90 p-1 shadow-[0_12px_28px_rgba(0,0,0,.45)] sm:size-20">
      {participant.imageUrl ? (
        // Provider logos are dynamic and not eligible for Next's static image optimization.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={participant.imageUrl}
          alt={participant.name}
          className="size-full rounded-full object-contain"
        />
      ) : (
        <span className="text-xl font-bold text-[#999]">{participant.name.slice(0, 1)}</span>
      )}
    </div>
  );
}

function EventHero({ event }: { event: SportsbookEvent }) {
  const [home, away] = event.participants;
  const time = eventTime(event.startsAt);
  const href = backHref(event.sport.slug, event.country.slug, event.league.slug);

  return (
    <>
      <div className="relative flex min-h-11 items-center justify-center px-12 py-3 text-[13px] font-medium text-[#999]">
        <Link
          href={href}
          className="absolute left-3 inline-flex items-center gap-1.5 transition-colors hover:text-white sm:left-4"
        >
          <Chevron direction="left" />
          <span className="hidden sm:inline">Back</span>
        </Link>
        <Link href={href} className="flex min-w-0 items-center hover:text-white">
          <SportIcon sport={event.sport.slug} name={event.sport.name} className="size-4" />
          <span className="-ml-1 size-3 shrink-0">
            <LeagueCountryFlag
              countrySlug={event.country.slug}
              countryName={event.country.name}
              leagueSlug={event.league.slug}
              selected={false}
              compact
            />
          </span>
          <span className="ml-2 truncate">{event.league.name}</span>
        </Link>
      </div>

      <div className="relative isolate overflow-hidden rounded-xl border border-white/[0.06] bg-[#102918] px-4 py-6 sm:py-8">
        <div className="absolute inset-0 -z-20 bg-[radial-gradient(circle_at_50%_110%,rgba(108,158,79,.5),transparent_52%),linear-gradient(115deg,#07130b_0%,#15331b_48%,#08130b_100%)]" />
        <div className="absolute inset-0 -z-10 [background-image:repeating-linear-gradient(95deg,transparent_0,transparent_68px,rgba(255,255,255,.055)_69px,rgba(255,255,255,.055)_136px)] opacity-30" />
        <div className="absolute top-1/2 left-1/2 -z-10 size-48 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/10 sm:size-64" />
        <div className="absolute top-1/2 left-0 -z-10 h-px w-full bg-white/10" />
        <div className="absolute inset-0 -z-10 bg-black/20" />

        <div className="mx-auto flex max-w-xl flex-col items-center">
          <div className="flex items-center justify-center gap-6 sm:gap-9">
            {home ? <ParticipantLogo participant={home} /> : <div className="size-16 sm:size-20" />}
            <div className="flex min-w-15 flex-col items-center text-center">
              {event.state === "live" ? (
                <span className="mb-1 rounded-full bg-[#f42e52]/15 px-2 py-0.5 text-[10px] font-semibold text-[#ff5b75] uppercase">
                  Live
                </span>
              ) : null}
              <span className="text-[14px] font-semibold text-white">{time.time}</span>
              <span className="text-[12px] text-[#b3b3b3]">{time.day}</span>
              <span className="mt-1 grid size-10 place-items-center rounded-full border border-white/10 bg-black/30 text-[11px] font-black tracking-[-0.08em] text-white/80">
                VS
              </span>
            </div>
            {away ? <ParticipantLogo participant={away} /> : <div className="size-16 sm:size-20" />}
          </div>
          <h1 className="mt-4 max-w-full truncate text-center text-[15px] font-bold text-white sm:text-[17px]">
            {event.title}
          </h1>
        </div>
      </div>
    </>
  );
}

function selectionFor(
  event: SportsbookEvent,
  market: SportsbookMarket,
  outcome: MarketOutcome
): SlipSelection {
  return {
    id: `${market.id}:${outcome.id}`,
    eventId: event.id,
    eventTitle: event.title,
    eventKind: event.eventKind,
    conditionId: market.id,
    marketTitle: market.title,
    outcomeId: outcome.id,
    outcomeTitle: outcomeTitle(outcome),
    odds: outcome.odds,
    expressForbidden: market.expressForbidden,
  };
}

function OutcomeButton({
  event,
  market,
  outcome,
  selected,
}: {
  event: SportsbookEvent;
  market: SportsbookMarket;
  outcome: MarketOutcome;
  selected: boolean;
}) {
  const enabled =
    canSelect(market, event.state === "live") &&
    outcome.state === "active" &&
    Number(outcome.odds) > 0;
  const title = outcomeTitle(outcome);

  return (
    <div className="min-w-0">
      <div
        title={title}
        className={`mb-1 truncate text-center text-[12px] font-semibold ${enabled ? "text-[#999]" : "text-[#666]"}`}
      >
        {title}
      </div>
      <button
        type="button"
        disabled={!enabled}
        aria-pressed={selected}
        aria-label={`${market.title}: ${title} at ${outcome.odds}`}
        onClick={() => toggleSportsbookSelection(selectionFor(event, market, outcome))}
        className={`h-12 w-full min-w-0 cursor-pointer rounded-[7px] border px-3 text-center text-[16px] font-bold tabular-nums transition-[background-color,border-color,color,transform] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-35 ${
          selected
            ? "border-[#999] bg-[#3a3a3a] text-[#b9fcff]"
            : "border-[#3b3b3b] bg-[#2e2e2e] text-[#ebebeb] hover:border-[#666] hover:bg-[#363636] hover:text-[#b9fcff]"
        }`}
      >
        {outcome.odds}
      </button>
    </div>
  );
}

function MarketGroupCard({
  group,
  event,
  collapsed,
  selectedIds,
  onToggle,
}: {
  group: EventMarketGroup;
  event: SportsbookEvent;
  collapsed: boolean;
  selectedIds: Set<string>;
  onToggle: () => void;
}) {
  const singleOnly = group.markets.some(({ expressForbidden }) => expressForbidden);
  const suspended = group.markets.every((market) => !canSelect(market, event.state === "live"));
  const elementId = `market-${group.key.replaceAll(/[^a-z0-9]+/gu, "-")}`;

  return (
    <article
      id={elementId}
      className="scroll-mt-32 overflow-hidden rounded-lg border border-[#333] bg-[#171717]"
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
        className="flex w-full cursor-pointer items-center gap-2 bg-[#222] px-3 py-3 text-left transition-colors hover:bg-[#2a2a2a]"
      >
        <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-[#ebebeb]">
          {group.title}
        </span>
        {singleOnly ? (
          <span className="rounded-full bg-[#efb72a]/10 px-2 py-1 text-[8px] font-semibold text-[#efb72a] uppercase">
            Single only
          </span>
        ) : null}
        {suspended ? <span className="text-[9px] font-medium text-[#777]">Suspended</span> : null}
        <span className={`text-[#777] transition-transform ${collapsed ? "" : "rotate-180"}`}>
          <Chevron />
        </span>
      </button>

      {!collapsed ? (
        <div className="space-y-4 border-t border-[#333] p-3">
          {group.markets.map((market) => (
            <div key={market.id} className="space-y-3">
              {chunkMarketOutcomes(market).map((row, rowIndex) => (
                <div
                  key={`${market.id}:${rowIndex}`}
                  className={`grid min-w-0 gap-2 ${
                    row.length === 2
                      ? "grid-cols-2"
                      : row.length === 3
                        ? "grid-cols-3"
                        : row.length === 4
                          ? "grid-cols-2 sm:grid-cols-4"
                          : "grid-cols-1"
                  }`}
                >
                  {row.map((outcome) => (
                    <OutcomeButton
                      key={outcome.id}
                      event={event}
                      market={market}
                      outcome={outcome}
                      selected={selectedIds.has(`${market.id}:${outcome.id}`)}
                    />
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : null}
    </article>
  );
}

export function EventMarkets({ eventId, sport, country, league, capabilities }: EventMarketsProps) {
  const query = useSportsbookEvent(eventId);
  const slip = useSportsbookSlip();
  const marketNavRef = useRef<HTMLDivElement>(null);
  const marketListRef = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [activeMarket, setActiveMarket] = useState("all");
  const [scrollState, setScrollState] = useState({ left: false, right: false });
  const conditionIds = query.data?.markets.map(({ id }) => id) ?? [];
  useSportsbookRealtime(eventId, conditionIds, Boolean(capabilities?.features.realtime));

  const groups = useMemo(() => groupEventMarkets(query.data?.markets ?? []), [query.data?.markets]);
  const visibleGroups = useMemo(() => filterEventMarketGroups(groups, search), [groups, search]);
  const allCollapsed =
    visibleGroups.length > 0 && visibleGroups.every(({ key }) => collapsed.has(key));

  useEffect(() => {
    const navigation = marketNavRef.current;
    if (!navigation) return;

    const update = () => {
      const max = navigation.scrollWidth - navigation.clientWidth;
      setScrollState({
        left: navigation.scrollLeft > 1,
        right: max > 1 && navigation.scrollLeft < max - 1,
      });
    };
    update();
    window.addEventListener("resize", update);
    navigation.addEventListener("scroll", update, { passive: true });
    return () => {
      window.removeEventListener("resize", update);
      navigation.removeEventListener("scroll", update);
    };
  }, [groups.length]);

  if (query.isLoading) {
    return (
      <div className="mx-auto mt-2 h-[620px] max-w-[1000px] animate-pulse rounded-xl border border-[#2e2e2e] bg-[#171717]" />
    );
  }
  if (query.isError || !query.data) {
    return (
      <div className="mx-auto mt-2 max-w-[1000px] rounded-xl border border-[#2e2e2e] bg-[#171717] px-5 py-20 text-center">
        <p className="text-[14px] font-semibold text-[#999]">This event could not be loaded.</p>
        <button
          type="button"
          onClick={() => void query.refetch()}
          className="mt-4 cursor-pointer rounded-lg bg-[#b9fcff] px-4 py-2 text-[11px] font-semibold text-[#171717]"
        >
          Try again
        </button>
        <Link
          href={backHref(sport, country, league)}
          className="mt-4 block text-[11px] font-medium text-[#999] hover:text-white"
        >
          Back to events
        </Link>
      </div>
    );
  }

  const { event } = query.data;
  const selectedIds = new Set(slip.selections.map(({ id }) => id));

  const scrollMarkets = (direction: "left" | "right") => {
    const navigation = marketNavRef.current;
    if (!navigation) return;
    navigation.scrollBy({
      left: (direction === "left" ? -1 : 1) * navigation.clientWidth * 0.65,
      behavior: "smooth",
    });
  };

  const goToMarket = (key: string) => {
    setActiveMarket(key);
    setSearch("");
    if (key === "all") {
      marketListRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    setCollapsed((current) => {
      const next = new Set(current);
      next.delete(key);
      return next;
    });
    requestAnimationFrame(() => {
      document
        .getElementById(`market-${key.replaceAll(/[^a-z0-9]+/gu, "-")}`)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  return (
    <section className="mx-auto mt-2 max-w-[1000px] rounded-xl border border-[#2e2e2e] bg-[#171717] p-2 shadow-[0_24px_80px_rgba(0,0,0,.16)]">
      <EventHero event={event} />

      <div className="mt-3 rounded-lg border border-[#2e2e2e] bg-[#1d1d1d] px-3 py-2.5 text-center text-[12px] font-semibold text-[#b9fcff]">
        Markets
      </div>

      <div className="sticky top-0 z-20 -mx-2 mt-3 space-y-2.5 bg-[#171717]/95 px-2 pt-1 pb-2 backdrop-blur-xl">
        <div className="flex items-center gap-2">
          <label className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-lg border border-[#333] bg-[#222] px-3 text-[#777] transition-colors focus-within:border-[#555] hover:border-[#444]">
            <SearchIcon />
            <input
              type="search"
              value={search}
              onChange={(changeEvent) => {
                setSearch(changeEvent.target.value);
                setActiveMarket("all");
              }}
              placeholder="Search markets..."
              className="min-w-0 flex-1 bg-transparent text-[13px] text-[#ebebeb] outline-none placeholder:text-[#777]"
            />
          </label>
          <button
            type="button"
            aria-label={allCollapsed ? "Expand all" : "Collapse all"}
            title={allCollapsed ? "Expand all" : "Collapse all"}
            onClick={() => {
              if (allCollapsed) setCollapsed(new Set());
              else setCollapsed(new Set(visibleGroups.map(({ key }) => key)));
            }}
            className="flex h-10 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-[#333] bg-[#222] px-3 text-[11px] font-medium text-[#888] transition-colors hover:border-[#555] hover:text-[#ebebeb]"
          >
            <CollapseIcon expanded={!allCollapsed} />
            <span className="hidden sm:inline">{allCollapsed ? "Expand all" : "Collapse all"}</span>
          </button>
        </div>

        <div className="flex items-center gap-2 rounded-lg border border-[#333] bg-[#222] p-2">
          <button
            type="button"
            disabled={!scrollState.left}
            onClick={() => scrollMarkets("left")}
            aria-label="Scroll markets left"
            className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-lg border border-[#333] bg-[#171717] text-[#777] transition-colors hover:border-[#555] hover:text-white disabled:pointer-events-none disabled:opacity-30"
          >
            <Chevron direction="left" />
          </button>
          <div
            ref={marketNavRef}
            className="flex min-w-0 flex-1 [scrollbar-width:none] items-center gap-2 overflow-x-auto scroll-smooth py-0.5 [&::-webkit-scrollbar]:hidden"
          >
            <button
              type="button"
              onClick={() => goToMarket("all")}
              className={`shrink-0 cursor-pointer rounded-lg border px-3 py-2 text-[12px] font-medium transition-colors ${
                activeMarket === "all"
                  ? "border-[#b9fcff]/40 bg-[#b9fcff]/10 text-[#b9fcff]"
                  : "border-[#333] bg-[#171717] text-[#888] hover:border-[#555] hover:text-white"
              }`}
            >
              All
            </button>
            {groups.map((group) => (
              <button
                key={group.key}
                type="button"
                title={group.title}
                onClick={() => goToMarket(group.key)}
                className={`max-w-56 shrink-0 cursor-pointer truncate rounded-lg border px-3 py-2 text-[12px] font-medium transition-colors ${
                  activeMarket === group.key
                    ? "border-[#b9fcff]/40 bg-[#b9fcff]/10 text-[#b9fcff]"
                    : "border-[#333] bg-[#171717] text-[#888] hover:border-[#555] hover:text-white"
                }`}
              >
                {group.title}
              </button>
            ))}
          </div>
          <button
            type="button"
            disabled={!scrollState.right}
            onClick={() => scrollMarkets("right")}
            aria-label="Scroll markets right"
            className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-lg border border-[#333] bg-[#171717] text-[#777] transition-colors hover:border-[#555] hover:text-white disabled:pointer-events-none disabled:opacity-30"
          >
            <Chevron direction="right" />
          </button>
        </div>
      </div>

      <div ref={marketListRef} className="space-y-2">
        {visibleGroups.map((group) => (
          <MarketGroupCard
            key={group.key}
            group={group}
            event={event}
            collapsed={collapsed.has(group.key)}
            selectedIds={selectedIds}
            onToggle={() =>
              setCollapsed((current) => {
                const next = new Set(current);
                if (next.has(group.key)) next.delete(group.key);
                else next.add(group.key);
                return next;
              })
            }
          />
        ))}
        {visibleGroups.length === 0 ? (
          <div className="rounded-lg border border-[#333] bg-[#1d1d1d] px-4 py-16 text-center text-[13px] text-[#777]">
            {groups.length === 0 ? "No markets are open for this event." : "No markets found."}
          </div>
        ) : null}
      </div>
    </section>
  );
}
