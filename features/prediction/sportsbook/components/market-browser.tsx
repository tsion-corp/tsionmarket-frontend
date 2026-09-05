"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { usePrices } from "@/hooks/use-prices";
import type {
  EventsQuery,
  SlipSelection,
  SportsbookBoardEvent,
  SportsbookCapabilities,
  SportsbookEventKind,
  SportsbookGameState,
  SportsbookMarket,
} from "../api";
import { useSportsbookEvents } from "../hooks/use-sportsbook";
import { useSportsbookBoardRealtime } from "../hooks/use-sportsbook-realtime";
import { formatTokenVolumeAsUsdc, formatUsdcVolume } from "../market-volume";
import { toggleSportsbookSelection, useSportsbookSlip } from "../slip-store";
import { sportsbookHref } from "./sportsbook-header";
import {
  MarketSelector,
  MarketToolbar,
  type MarketOption,
  type SportsbookSort,
  type SportsbookTimeFilter,
  type SportsbookView,
} from "./market-toolbar";

interface MarketBrowserProps {
  sport: string;
  country: string;
  league: string;
  state: SportsbookGameState;
  eventKind: SportsbookEventKind;
  capabilities: SportsbookCapabilities | undefined;
  search: string;
}

function eventTime(startsAt: number): { day: string; time: string } {
  const timestamp = startsAt < 10_000_000_000 ? startsAt * 1000 : startsAt;
  const date = new Date(timestamp);
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);
  const dayKey = date.toDateString();
  const day =
    dayKey === today.toDateString()
      ? "Today"
      : dayKey === tomorrow.toDateString()
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

interface ReferenceVolumesResponse {
  currency: "USDC";
  volumes: Record<string, string>;
}

async function getReferenceVolumes(
  events: SportsbookBoardEvent[],
  params: Pick<EventsQuery, "sport" | "state" | "country" | "league">
): Promise<ReferenceVolumesResponse> {
  const query = new URLSearchParams({
    ids: events.map(({ id }) => id).join(","),
    sport: params.sport,
    state: params.state ?? "prematch",
  });
  if (params.country) query.set("country", params.country);
  if (params.league) query.set("league", params.league);
  const response = await fetch(`/api/sportsbook/reference-volumes?${query}`);
  if (!response.ok) throw new Error("Reference volumes are unavailable");
  return response.json() as Promise<ReferenceVolumesResponse>;
}

function availableMarkets(event: SportsbookBoardEvent): SportsbookMarket[] {
  return event.markets.filter(
    (market) =>
      !market.hidden &&
      market.state === "active" &&
      (event.state === "live" ? market.liveEnabled : market.prematchEnabled) &&
      market.outcomes.filter((outcome) => !outcome.hidden).length >= 2
  );
}

function marketKey(market: SportsbookMarket): string {
  if (market.marketId != null) return `market:${market.marketId}`;
  return `title:${market.title.trim().toLowerCase().replaceAll(/\s+/gu, " ")}`;
}

function marketPreference(market: SportsbookMarket): number {
  const preferred = [
    /^match winner$/iu,
    /^full time result$/iu,
    /^winner$/iu,
    /^moneyline$/iu,
    /^1x2$/iu,
  ];
  const preferredIndex = preferred.findIndex((pattern) => pattern.test(market.title.trim()));
  if (preferredIndex >= 0) return preferredIndex;
  return market.outcomes.length <= 3 ? preferred.length : preferred.length + 1;
}

function primaryMarket(event: SportsbookBoardEvent): SportsbookMarket | undefined {
  return availableMarkets(event).toSorted((left, right) => {
    const preference = marketPreference(left) - marketPreference(right);
    if (preference !== 0) return preference;
    return (
      Number(left.sortOrder ?? Number.MAX_SAFE_INTEGER) -
      Number(right.sortOrder ?? Number.MAX_SAFE_INTEGER)
    );
  })[0];
}

function marketForEvent(
  event: SportsbookBoardEvent,
  selectedMarketKey: string
): SportsbookMarket | undefined {
  if (!selectedMarketKey) return primaryMarket(event);
  return availableMarkets(event).find((market) => marketKey(market) === selectedMarketKey);
}

function collectMarketOptions(events: SportsbookBoardEvent[]): MarketOption[] {
  const options = new Map<
    string,
    { option: MarketOption; preference: number; sortOrder: number }
  >();
  for (const event of events) {
    for (const market of availableMarkets(event)) {
      const key = marketKey(market);
      const candidate = {
        option: { key, label: market.title.trim() },
        preference: marketPreference(market),
        sortOrder: Number(market.sortOrder ?? Number.MAX_SAFE_INTEGER),
      };
      const current = options.get(key);
      if (
        !current ||
        candidate.preference < current.preference ||
        (candidate.preference === current.preference && candidate.sortOrder < current.sortOrder)
      ) {
        options.set(key, candidate);
      }
    }
  }
  return [...options.values()]
    .toSorted(
      (left, right) =>
        left.preference - right.preference ||
        left.sortOrder - right.sortOrder ||
        left.option.label.localeCompare(right.option.label)
    )
    .map(({ option }) => option);
}

function isInTimeWindow(startsAt: number, filter: SportsbookTimeFilter): boolean {
  if (filter === "all") return true;
  const startsAtMs = startsAt < 10_000_000_000 ? startsAt * 1000 : startsAt;
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);
  if (filter === "today") return startsAtMs <= endOfToday.getTime();
  const endOfTomorrow = new Date(endOfToday);
  endOfTomorrow.setDate(endOfTomorrow.getDate() + 1);
  return startsAtMs >= endOfToday.getTime() && startsAtMs <= endOfTomorrow.getTime();
}

function selectionFor(
  event: SportsbookBoardEvent,
  market: SportsbookMarket,
  outcome: SportsbookMarket["outcomes"][number]
): SlipSelection {
  return {
    id: `${market.id}:${outcome.id}`,
    eventId: event.id,
    eventTitle: event.title,
    eventKind: event.eventKind,
    conditionId: market.id,
    marketTitle: market.title,
    outcomeId: outcome.id,
    outcomeTitle: outcome.title,
    odds: outcome.odds,
    expressForbidden: market.expressForbidden,
  };
}

function outcomeTitle(
  event: SportsbookBoardEvent,
  outcome: SportsbookMarket["outcomes"][number],
  index: number
): string {
  const normalized = outcome.title.trim().toLowerCase();
  if (["home", "team 1", "1"].includes(normalized)) {
    return event.participants[0]?.name ?? outcome.title;
  }
  if (["away", "team 2", "2"].includes(normalized)) {
    return event.participants[1]?.name ?? outcome.title;
  }
  if (normalized === "draw" || normalized === "x") return "Draw";
  if (outcome.title.trim()) return outcome.title;
  return event.participants[index]?.name ?? `Outcome ${index + 1}`;
}

function ParticipantLogo({ name, imageUrl }: { name: string; imageUrl: string | null }) {
  return (
    <span className="grid size-6 shrink-0 place-items-center overflow-hidden rounded-full bg-[#3b3b3b] p-0.5 min-[1280px]:size-7">
      {imageUrl?.startsWith("http") ? (
        <span
          aria-hidden="true"
          className="size-full rounded-full bg-contain bg-center bg-no-repeat"
          style={{ backgroundImage: `url(${JSON.stringify(imageUrl)})` }}
        />
      ) : (
        <span className="grid size-full place-items-center rounded-full bg-[#333] text-[9px] font-medium text-[#999]">
          {name.slice(0, 1).toUpperCase()}
        </span>
      )}
    </span>
  );
}

function OddsButton({
  event,
  market,
  outcome,
  index,
  selected,
}: {
  event: SportsbookBoardEvent;
  market: SportsbookMarket;
  outcome: SportsbookMarket["outcomes"][number];
  index: number;
  selected: boolean;
}) {
  const enabled =
    outcome.state === "active" &&
    (event.state === "live" ? market.liveEnabled : market.prematchEnabled);
  return (
    <div className="min-w-0 overflow-hidden">
      <p className="mb-1 hidden h-4 w-full truncate text-center text-xs leading-4 font-semibold text-[#999] min-[802px]:block">
        {outcomeTitle(event, outcome, index)}
      </p>
      <button
        type="button"
        disabled={!enabled}
        aria-pressed={selected}
        onClick={() => toggleSportsbookSelection(selectionFor(event, market, outcome))}
        className={`flex h-12 w-full min-w-0 cursor-pointer flex-col items-center justify-center rounded-lg border px-3 text-sm font-semibold transition-colors select-none disabled:cursor-not-allowed disabled:opacity-35 min-[802px]:px-4 ${
          selected
            ? "border-[#ebebeb] bg-[#ebebeb] text-[#171717]"
            : "border-[#3b3b3b] bg-[#2e2e2e] text-[#ebebeb] hover:border-[#999] hover:bg-[#3b3b3b] hover:text-[#b9fcff]"
        }`}
      >
        <span
          className={`mb-0.5 h-4 w-full truncate text-center text-xs leading-4 font-semibold min-[802px]:hidden ${selected ? "text-[#3b3b3b]" : "text-[#999]"}`}
        >
          {outcomeTitle(event, outcome, index)}
        </span>
        <span className="text-base leading-6 font-bold tabular-nums">{outcome.odds}</span>
      </button>
    </div>
  );
}

function SportIcon({ slug }: { slug: string }) {
  const safeSlug = slug.replaceAll(/[^a-z0-9-]/giu, "");
  return (
    <span
      aria-hidden="true"
      className="size-4 shrink-0 bg-contain bg-center bg-no-repeat opacity-60"
      style={{ backgroundImage: `url("/images/sporticons/${safeSlug}.png")` }}
    />
  );
}

function ListEvent({
  event,
  selectedMarketKey,
  selectedIds,
  referenceTurnover,
  tokenSymbol,
  ethPriceUsd,
}: {
  event: SportsbookBoardEvent;
  selectedMarketKey: string;
  selectedIds: Set<string>;
  referenceTurnover: string | undefined;
  tokenSymbol: string;
  ethPriceUsd: number;
}) {
  const market = marketForEvent(event, selectedMarketKey);
  const outcomes = market?.outcomes.filter((outcome) => !outcome.hidden).slice(0, 4) ?? [];
  const time = eventTime(event.startsAt);
  const participants = event.participants.slice(0, 2);
  const eventHref = `/prediction/markets/${event.id}?sport=${event.sport.slug}&country=${event.country.slug}&league=${event.league.slug}`;
  const outcomeColumns =
    outcomes.length === 4 ? "grid-cols-4" : outcomes.length === 3 ? "grid-cols-3" : "grid-cols-2";

  return (
    <article className="group relative flex flex-col bg-[#242424] px-2 py-2 transition-colors hover:bg-[#292929] min-[1280px]:px-4">
      <div className="grid min-w-0 grid-cols-[46%_54%] items-start min-[1280px]:grid-cols-[1fr_auto_1fr] min-[1280px]:items-center">
        <Link
          href={eventHref}
          className="flex h-full w-full min-w-0 flex-col justify-self-start overflow-hidden max-[1279px]:max-w-[min(100%,20rem)]"
        >
          <div className="mb-2 flex min-w-0 items-center overflow-hidden max-[1279px]:w-full max-[1279px]:text-xs">
            {event.state === "live" ? (
              <span className="mr-2 size-1.5 shrink-0 rounded-full bg-[#f42e52]" />
            ) : (
              <>
                <span className="mr-1 shrink-0 text-[13px] leading-4 font-semibold whitespace-nowrap text-[#adadad]">
                  {time.time}
                </span>
                <span className="mr-2 shrink-0 text-xs leading-[14px] whitespace-nowrap text-[#999]">
                  <span className="max-[1280px]:hidden">{time.day}</span>
                  <span className="min-[1281px]:hidden">
                    {time.day === "Tomorrow" ? "Tomo." : time.day}
                  </span>
                </span>
              </>
            )}
            <SportIcon slug={event.sport.slug} />
            <span className="ml-1 min-w-0 flex-1 truncate text-[13px] leading-4 font-semibold text-[#adadad]">
              {event.league.name}
            </span>
          </div>
          <div className="flex min-w-0 flex-grow items-center">
            {participants.length >= 2 ? (
              <div className="flex w-full min-w-0 flex-col">
                {participants.map((participant, index) => (
                  <p
                    key={`${participant.name}:${index}`}
                    className="flex w-full min-w-0 items-center last:mb-0 max-[1279px]:mb-1 min-[1280px]:ml-2"
                  >
                    <ParticipantLogo name={participant.name} imageUrl={participant.imageUrl} />
                    <span className="ml-2 min-w-0 flex-1 truncate text-sm leading-5 font-medium text-[#ebebeb] min-[1280px]:text-xl min-[1280px]:leading-[26px]">
                      {participant.name}
                    </span>
                  </p>
                ))}
              </div>
            ) : (
              <p className="line-clamp-2 text-sm leading-5 font-medium text-[#ebebeb] min-[1280px]:text-xl min-[1280px]:leading-[26px]">
                {event.title}
              </p>
            )}
          </div>
        </Link>

        <div
          className={`mt-2 grid w-full min-w-0 gap-2 justify-self-stretch overflow-hidden pb-2 ${outcomeColumns} min-[1280px]:mt-0 min-[1280px]:w-[28rem] min-[1280px]:max-w-[28rem] min-[1280px]:min-w-[28rem] min-[1280px]:shrink-0 min-[1280px]:justify-self-center min-[1280px]:overflow-visible min-[1280px]:pb-0`}
        >
          {market && outcomes.length ? (
            outcomes.map((outcome, index) => (
              <OddsButton
                key={outcome.id}
                event={event}
                market={market}
                outcome={outcome}
                index={index}
                selected={selectedIds.has(`${market.id}:${outcome.id}`)}
              />
            ))
          ) : (
            <Link
              href={eventHref}
              className="col-span-full flex h-12 items-center justify-center rounded-lg border border-[#3b3b3b] bg-[#2e2e2e] text-[11px] text-[#999] hover:text-[#ebebeb]"
            >
              View markets
            </Link>
          )}
        </div>

        <div className="hidden w-[6.5rem] shrink-0 items-center justify-self-end min-[1280px]:flex">
          <p className="w-full text-center text-[13px] leading-4 text-[#999]">
            {referenceTurnover
              ? formatUsdcVolume(referenceTurnover)
              : formatTokenVolumeAsUsdc(event.turnover, tokenSymbol, ethPriceUsd)}
          </p>
        </div>
      </div>
    </article>
  );
}

function GridEvent({
  event,
  selectedMarketKey,
  selectedIds,
}: {
  event: SportsbookBoardEvent;
  selectedMarketKey: string;
  selectedIds: Set<string>;
}) {
  const market = marketForEvent(event, selectedMarketKey);
  const outcomes = market?.outcomes.filter((outcome) => !outcome.hidden).slice(0, 3) ?? [];
  const time = eventTime(event.startsAt);
  return (
    <article className="rounded-lg border border-[#333] bg-[#242424] p-4">
      <div className="flex items-center justify-between text-[10px] text-[#999]">
        <span className="truncate">{event.league.name}</span>
        <span>{event.state === "live" ? "Live" : `${time.time} ${time.day}`}</span>
      </div>
      <Link
        href={`/prediction/markets/${event.id}?sport=${event.sport.slug}&country=${event.country.slug}&league=${event.league.slug}`}
        className="mt-4 block min-h-11 text-sm leading-5 font-medium text-[#ebebeb] hover:text-[#b9fcff]"
      >
        {event.title}
      </Link>
      <div className="mt-4 grid grid-cols-2 gap-2">
        {market && outcomes.length ? (
          outcomes.map((outcome, index) => (
            <OddsButton
              key={outcome.id}
              event={event}
              market={market}
              outcome={outcome}
              index={index}
              selected={selectedIds.has(`${market.id}:${outcome.id}`)}
            />
          ))
        ) : (
          <span className="col-span-full py-3 text-center text-xs text-[#7e7e7e]">
            Markets unavailable
          </span>
        )}
      </div>
    </article>
  );
}

export function MarketBrowser({
  sport,
  country,
  league,
  state,
  eventKind,
  capabilities,
  search,
}: MarketBrowserProps) {
  const router = useRouter();
  const ethPriceUsd = usePrices(["ETH"]).ETH ?? 0;
  const [offset, setOffset] = useState(0);
  const [sort, setSort] = useState<SportsbookSort>("turnover");
  const [view, setView] = useState<SportsbookView>("list");
  const [timeFilter, setTimeFilter] = useState<SportsbookTimeFilter>("all");
  const [selectedMarket, setSelectedMarket] = useState("");
  const slip = useSportsbookSlip();
  const normalizedSearch = search.trim().toLowerCase();
  const effectiveOffset = normalizedSearch ? 0 : offset;
  const params = useMemo<EventsQuery>(
    () => ({
      sport,
      country: country || undefined,
      league: league || undefined,
      state,
      eventKind,
      sort,
      direction: sort === "turnover" ? "desc" : "asc",
      limit: 24,
      offset: effectiveOffset,
    }),
    [country, effectiveOffset, eventKind, league, sort, sport, state]
  );
  const query = useSportsbookEvents(params);
  const fetchedEvents = query.data?.events ?? [];
  const referenceVolumeQuery = useQuery({
    queryKey: [
      "sportsbook",
      "reference-volumes",
      params.sport,
      params.state,
      params.country ?? "all",
      params.league ?? "all",
      fetchedEvents.map(({ id }) => id).join(","),
    ],
    queryFn: () => getReferenceVolumes(fetchedEvents, params),
    enabled: fetchedEvents.length > 0,
    staleTime: state === "live" ? 10_000 : 30_000,
    retry: 1,
  });
  const referenceVolumes = referenceVolumeQuery.data?.volumes ?? {};
  const searchedEvents = normalizedSearch
    ? fetchedEvents.filter((event) =>
        [event.league.name, event.country.name, ...event.participants.map(({ name }) => name)].some(
          (value) => value.toLowerCase().includes(normalizedSearch)
        )
      )
    : fetchedEvents;
  const timeFilteredEvents = searchedEvents.filter((event) =>
    isInTimeWindow(event.startsAt, timeFilter)
  );
  const marketOptions = collectMarketOptions(timeFilteredEvents);
  const selectedMarketKey = marketOptions.some(({ key }) => key === selectedMarket)
    ? selectedMarket
    : (marketOptions[0]?.key ?? "");
  const events = timeFilteredEvents
    .filter((event) => Boolean(marketForEvent(event, selectedMarketKey)))
    .toSorted((left, right) => {
      if (sort !== "turnover" || !referenceVolumeQuery.data) return 0;
      return Number(referenceVolumes[right.id] ?? -1) - Number(referenceVolumes[left.id] ?? -1);
    });

  const primaryConditions = events.flatMap((event) => {
    const market = marketForEvent(event, selectedMarketKey);
    return market ? [market.id] : [];
  });
  useSportsbookBoardRealtime(
    params,
    events.map(({ id }) => id),
    primaryConditions,
    Boolean(capabilities?.features.realtime)
  );
  const selectedIds = new Set(slip.selections.map(({ id }) => id));

  const changeTimeFilter = (nextFilter: SportsbookTimeFilter) => {
    setTimeFilter(nextFilter);
    setOffset(0);
    if (state === "live") {
      router.push(sportsbookHref(sport, league, "prematch", eventKind, country));
    }
  };

  const toggleLive = () => {
    setTimeFilter("all");
    setOffset(0);
    router.push(
      sportsbookHref(sport, league, state === "live" ? "prematch" : "live", eventKind, country)
    );
  };

  return (
    <section className="bg-[#171717] font-[family-name:var(--font-sportsbook)] font-normal">
      <MarketToolbar
        live={state === "live"}
        onLiveToggle={toggleLive}
        timeFilter={timeFilter}
        onTimeFilterChange={changeTimeFilter}
        sort={sort}
        onSortChange={(nextSort) => {
          setSort(nextSort);
          setOffset(0);
        }}
        view={view}
        onViewChange={setView}
        marketOptions={marketOptions}
        selectedMarketKey={selectedMarketKey}
        onMarketChange={setSelectedMarket}
      />

      {view === "list" ? (
        <div className="mb-1 hidden grid-cols-[1fr_auto_1fr] items-center px-4 min-[1280px]:grid">
          <span />
          <div className="justify-self-center">
            <MarketSelector
              options={marketOptions}
              selectedKey={selectedMarketKey}
              onChange={setSelectedMarket}
            />
          </div>
          <div className="grid w-[6.5rem] shrink-0 items-center justify-self-end">
            <span className="text-center text-[13px] leading-4 font-semibold text-[#adadad]">
              Volume
            </span>
          </div>
        </div>
      ) : null}

      {query.isLoading ? (
        <div className="space-y-1 bg-[#111]">
          {Array.from({ length: 8 }, (_, index) => (
            <div key={index} className="h-[94px] animate-pulse bg-[#242424]" />
          ))}
        </div>
      ) : query.isError ? (
        <div className="bg-[#171717] px-5 py-20 text-center">
          <p className="text-sm font-medium text-[#999]">Markets could not load.</p>
          <button
            type="button"
            onClick={() => void query.refetch()}
            className="mt-4 cursor-pointer rounded-lg bg-[#b9fcff] px-5 py-2 text-xs font-semibold text-[#171717]"
          >
            Try again
          </button>
        </div>
      ) : events.length === 0 ? (
        <div className="bg-[#171717] px-5 py-20 text-center text-sm text-[#7e7e7e]">
          No matching events are open right now.
        </div>
      ) : view === "grid" ? (
        <div className="grid gap-2 bg-[#171717] p-2 sm:grid-cols-2 xl:grid-cols-3">
          {events.map((event) => (
            <GridEvent
              key={event.id}
              event={event}
              selectedMarketKey={selectedMarketKey}
              selectedIds={selectedIds}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-1 bg-[#171717] p-2">
          {events.map((event) => (
            <ListEvent
              key={event.id}
              event={event}
              selectedMarketKey={selectedMarketKey}
              selectedIds={selectedIds}
              referenceTurnover={referenceVolumes[event.id]}
              tokenSymbol={capabilities?.token.symbol ?? "WETH"}
              ethPriceUsd={ethPriceUsd}
            />
          ))}
        </div>
      )}

      {events.length ? (
        <footer className="flex items-center justify-between bg-[#171717] px-4 py-3">
          <span className="text-[10px] text-[#7e7e7e]">
            {normalizedSearch || timeFilter !== "all"
              ? events.length
              : (query.data?.total ?? events.length)}{" "}
            events
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={effectiveOffset === 0}
              onClick={() => setOffset(Math.max(0, effectiveOffset - 24))}
              className="cursor-pointer rounded-lg border border-[#333] px-3 py-2 text-[10px] text-[#999] disabled:opacity-25"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={Boolean(normalizedSearch) || query.data?.nextOffset == null}
              onClick={() => setOffset(query.data?.nextOffset ?? effectiveOffset)}
              className="cursor-pointer rounded-lg border border-[#333] px-3 py-2 text-[10px] text-[#999] disabled:opacity-25"
            >
              Next
            </button>
          </div>
        </footer>
      ) : null}
    </section>
  );
}
