"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import type { SportsbookEventKind, SportsbookGameState, SportsbookOrder } from "../api";
import { useSportsbookCapabilities, useSportsbookNavigation } from "../hooks/use-sportsbook";
import { updateSportsbookSlip, useSportsbookSlip } from "../slip-store";
import { selectionsFromOrder } from "../ticket-rebet";
import { SportsbookHeader } from "./sportsbook-header";

const MarketBrowser = dynamic(
  () => import("./market-browser").then((module) => module.MarketBrowser),
  { loading: () => <SportsbookLoading />, ssr: false }
);
const EventMarkets = dynamic(
  () => import("./event-markets").then((module) => module.EventMarkets),
  { loading: () => <SportsbookLoading />, ssr: false }
);
const BetSlipPanel = dynamic(
  () => import("./bet-slip-panel").then((module) => module.BetSlipPanel),
  { ssr: false }
);
const TicketModal = dynamic(() => import("./ticket-modal").then((module) => module.TicketModal), {
  ssr: false,
});

function SportsbookLoading() {
  return (
    <div className="h-[620px] animate-pulse rounded-lg border border-white/5 bg-white/[0.025]" />
  );
}

interface SportsbookShellProps {
  requestedSport: string;
  country: string;
  league: string;
  state: SportsbookGameState;
  eventKind: SportsbookEventKind;
  eventId?: string;
  initialView?: "markets" | "tickets";
}

export function SportsbookShell({
  requestedSport,
  country,
  league,
  state,
  eventKind,
  eventId,
  initialView = "markets",
}: SportsbookShellProps) {
  const navigation = useSportsbookNavigation();
  const capabilities = useSportsbookCapabilities();
  const slip = useSportsbookSlip();
  const [mobileOpen, setMobileOpen] = useState(initialView === "tickets");
  const [desktopOpen, setDesktopOpen] = useState(
    initialView === "tickets" || slip.selections.length > 0
  );
  const previousSelectionCount = useRef(slip.selections.length);
  const [ticketId, setTicketId] = useState<string | null>(null);
  const [focusSlipKey, setFocusSlipKey] = useState(0);
  const [leagueSearch, setLeagueSearch] = useState("");
  const sports = navigation.data?.sports ?? [];
  const activeSport =
    sports.find(({ sport }) => sport.slug === requestedSport)?.sport.slug ??
    sports[0]?.sport.slug ??
    requestedSport;
  const isLeagueSearchActive = leagueSearch.trim().length > 0;

  useEffect(() => {
    if (slip.selections.length > previousSelectionCount.current) {
      setDesktopOpen(true);
    }
    previousSelectionCount.current = slip.selections.length;
  }, [slip.selections.length]);

  function rebet(order: SportsbookOrder) {
    updateSportsbookSlip((current) => ({
      ...current,
      selections: selectionsFromOrder(order),
    }));
    setTicketId(null);
    setFocusSlipKey((key) => key + 1);
    if (window.matchMedia("(min-width: 1280px)").matches) {
      setDesktopOpen(true);
    } else {
      setMobileOpen(true);
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-black text-white">
      <div
        className={`relative transition-[padding] duration-300 ease-in-out ${desktopOpen ? "xl:pr-[326px]" : ""}`}
      >
        <SportsbookHeader
          sports={sports}
          activeSport={activeSport}
          activeCountry={isLeagueSearchActive ? "" : country}
          activeLeague={isLeagueSearchActive ? "" : league}
          state={state}
          eventKind={eventKind}
          onLeagueSearch={setLeagueSearch}
        />

        <div className="mx-auto w-full max-w-[1350px] px-0 pb-10">
          {navigation.isLoading || !activeSport ? (
            <SportsbookLoading />
          ) : eventId ? (
            <EventMarkets
              eventId={eventId}
              sport={activeSport}
              country={country}
              league={league}
              capabilities={capabilities.data}
            />
          ) : (
            <MarketBrowser
              key={`${activeSport}:${country}:${league}:${state}:${eventKind}`}
              sport={activeSport}
              country={isLeagueSearchActive ? "" : country}
              league={isLeagueSearchActive ? "" : league}
              state={state}
              eventKind={eventKind}
              capabilities={capabilities.data}
              search={leagueSearch}
            />
          )}
        </div>
      </div>

      <aside
        className={`fixed top-0 right-0 z-[60] hidden h-screen bg-[#171717] transition-[width] duration-300 ease-in-out xl:block ${
          desktopOpen ? "w-[326px]" : "w-0"
        }`}
      >
        <button
          type="button"
          title="Toggle sidebar"
          aria-label={desktopOpen ? "Collapse ticket" : "Open ticket"}
          aria-expanded={desktopOpen}
          onClick={() => setDesktopOpen((open) => !open)}
          className="absolute top-1/2 left-0 z-10 grid size-10 -translate-x-full -translate-y-1/2 cursor-pointer place-items-center rounded-l-md bg-[#171717] text-[#999] transition-colors hover:text-[#ebebeb]"
        >
          <svg
            viewBox="0 0 16 16"
            aria-hidden="true"
            className={`size-6 fill-current transition-transform duration-300 ${desktopOpen ? "rotate-0" : "rotate-180"}`}
          >
            <path d="M6.194 4.473a.664.664 0 0 0 0 .94L8.78 8l-2.586 2.587a.664.664 0 1 0 .94.94l3.06-3.06a.664.664 0 0 0 0-.94l-3.06-3.06a.664.664 0 0 0-.94.006Z" />
          </svg>
        </button>
        <div className="h-full overflow-hidden pt-16">
          <div
            className={`h-full w-[326px] border-l border-white/[0.07] transition-opacity duration-300 ${
              desktopOpen ? "opacity-100" : "pointer-events-none opacity-0"
            }`}
          >
            {desktopOpen ? (
              <BetSlipPanel
                key={`desktop-${focusSlipKey}`}
                capabilities={capabilities.data}
                initialTab={
                  focusSlipKey > 0 ? "slip" : initialView === "tickets" ? "tickets" : "slip"
                }
                onTicket={setTicketId}
                embedded
              />
            ) : null}
          </div>
        </div>
      </aside>

      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        aria-label="Open ticket"
        className="fixed right-4 bottom-[max(20px,env(safe-area-inset-bottom))] z-[55] grid h-12 min-w-14 cursor-pointer place-items-center rounded-xl bg-[#5ba8ff] px-3 text-[11px] font-semibold text-black shadow-[0_12px_35px_rgba(0,0,0,.5)] xl:hidden"
      >
        Ticket {slip.selections.length ? `(${slip.selections.length})` : ""}
      </button>

      {mobileOpen ? (
        <div className="fixed inset-0 z-[80] flex items-end bg-black/75 xl:hidden">
          <button
            type="button"
            aria-label="Close ticket"
            onClick={() => setMobileOpen(false)}
            className="absolute inset-0 cursor-default"
          />
          <div className="relative w-full">
            <BetSlipPanel
              key={`mobile-${focusSlipKey}`}
              capabilities={capabilities.data}
              initialTab={
                focusSlipKey > 0 ? "slip" : initialView === "tickets" ? "tickets" : "slip"
              }
              onTicket={(id) => {
                setMobileOpen(false);
                setTicketId(id);
              }}
              onClose={() => setMobileOpen(false)}
            />
          </div>
        </div>
      ) : null}
      {ticketId ? (
        <TicketModal ticketId={ticketId} onClose={() => setTicketId(null)} onRebet={rebet} />
      ) : null}
    </main>
  );
}
